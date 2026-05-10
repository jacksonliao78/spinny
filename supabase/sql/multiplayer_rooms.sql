-- Multiplayer room tables for signed-in 1v1 rooms.
-- Run this in Supabase SQL Editor once per project.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  join_code text NOT NULL UNIQUE CHECK (join_code = upper(join_code) AND length(join_code) BETWEEN 4 AND 12),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
  status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'countdown', 'playing', 'finished', 'abandoned')),
  host_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  max_players int NOT NULL DEFAULT 2 CHECK (max_players = 2),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  seed text,
  countdown_starts_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.room_members (
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  slot int NOT NULL CHECK (slot IN (1, 2)),
  ready boolean NOT NULL DEFAULT false,
  connected boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id),
  UNIQUE (room_id, slot)
);

CREATE TABLE IF NOT EXISTS public.room_results (
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  placement int NOT NULL CHECK (placement > 0),
  score bigint NOT NULL DEFAULT 0,
  lines int NOT NULL DEFAULT 0,
  duration_ms bigint NOT NULL DEFAULT 0,
  pieces int NOT NULL DEFAULT 0,
  garbage_sent int NOT NULL DEFAULT 0,
  garbage_received int NOT NULL DEFAULT 0,
  finished_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS rooms_public_lobby_idx
  ON public.rooms (created_at DESC)
  WHERE visibility = 'public' AND status = 'lobby';

CREATE INDEX IF NOT EXISTS room_members_user_idx
  ON public.room_members (user_id, room_id);

CREATE INDEX IF NOT EXISTS room_results_room_idx
  ON public.room_results (room_id, placement);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rooms_touch_updated_at ON public.rooms;
CREATE TRIGGER rooms_touch_updated_at
BEFORE UPDATE ON public.rooms
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.is_room_member(target_room_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.room_members
    WHERE room_id = target_room_id
      AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_room_host(target_room_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rooms
    WHERE id = target_room_id
      AND host_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.room_has_open_slot(target_room_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rooms r
    WHERE r.id = target_room_id
      AND r.status = 'lobby'
      AND (r.visibility = 'public' OR r.host_user_id = auth.uid())
      AND (
        SELECT count(*)
        FROM public.room_members m
        WHERE m.room_id = target_room_id
      ) < r.max_players
  );
$$;

CREATE OR REPLACE FUNCTION public.join_private_room_by_code(
  target_join_code text,
  member_username text,
  requested_slot int DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_room public.rooms%ROWTYPE;
  chosen_slot int;
  clean_username text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT *
  INTO target_room
  FROM public.rooms
  WHERE join_code = upper(trim(target_join_code))
    AND visibility = 'private'
    AND status = 'lobby'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = target_room.id AND user_id = auth.uid()
  ) THEN
    RETURN target_room.id;
  END IF;

  IF requested_slot IN (1, 2) AND NOT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = target_room.id AND slot = requested_slot
  ) THEN
    chosen_slot := requested_slot;
  ELSE
    SELECT candidate.slot_number
    INTO chosen_slot
    FROM generate_series(1, target_room.max_players) AS candidate(slot_number)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.room_members
      WHERE room_id = target_room.id AND room_members.slot = candidate.slot_number
    )
    ORDER BY candidate.slot_number
    LIMIT 1;
  END IF;

  IF chosen_slot IS NULL THEN
    RAISE EXCEPTION 'Room is full';
  END IF;

  clean_username := left(nullif(trim(member_username), ''), 64);

  INSERT INTO public.room_members (room_id, user_id, username, slot)
  VALUES (target_room.id, auth.uid(), coalesce(clean_username, 'player'), chosen_slot);

  RETURN target_room.id;
END;
$$;

REVOKE ALL ON FUNCTION public.join_private_room_by_code(text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_private_room_by_code(text, text, int) TO authenticated;

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rooms_select_visible" ON public.rooms;
CREATE POLICY "rooms_select_visible"
ON public.rooms
FOR SELECT
TO authenticated
USING (
  (visibility = 'public' AND status = 'lobby')
  OR host_user_id = auth.uid()
  OR public.is_room_member(id)
);

DROP POLICY IF EXISTS "rooms_insert_host" ON public.rooms;
CREATE POLICY "rooms_insert_host"
ON public.rooms
FOR INSERT
TO authenticated
WITH CHECK (
  host_user_id = auth.uid()
  AND max_players = 2
  AND status = 'lobby'
);

DROP POLICY IF EXISTS "rooms_update_host" ON public.rooms;
CREATE POLICY "rooms_update_host"
ON public.rooms
FOR UPDATE
TO authenticated
USING (host_user_id = auth.uid())
WITH CHECK (host_user_id = auth.uid());

DROP POLICY IF EXISTS "rooms_delete_host" ON public.rooms;
CREATE POLICY "rooms_delete_host"
ON public.rooms
FOR DELETE
TO authenticated
USING (host_user_id = auth.uid());

DROP POLICY IF EXISTS "room_members_select_room" ON public.room_members;
CREATE POLICY "room_members_select_room"
ON public.room_members
FOR SELECT
TO authenticated
USING (public.is_room_member(room_id) OR public.is_room_host(room_id));

DROP POLICY IF EXISTS "room_members_insert_self" ON public.room_members;
CREATE POLICY "room_members_insert_self"
ON public.room_members
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.room_has_open_slot(room_id)
  AND (
    public.is_room_host(room_id)
    OR EXISTS (
      SELECT 1
      FROM public.rooms
      WHERE id = room_id
        AND visibility = 'public'
        AND status = 'lobby'
    )
  )
);

DROP POLICY IF EXISTS "room_members_update_self" ON public.room_members;
DROP POLICY IF EXISTS "room_members_update_self_presence" ON public.room_members;
CREATE POLICY "room_members_update_self_presence"
ON public.room_members
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND room_id = (
    SELECT old_member.room_id
    FROM public.room_members AS old_member
    WHERE old_member.room_id = room_members.room_id
      AND old_member.user_id = auth.uid()
  )
  AND slot = (
    SELECT old_member.slot
    FROM public.room_members AS old_member
    WHERE old_member.room_id = room_members.room_id
      AND old_member.user_id = auth.uid()
  )
  AND username = (
    SELECT old_member.username
    FROM public.room_members AS old_member
    WHERE old_member.room_id = room_members.room_id
      AND old_member.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "room_members_delete_self_or_host" ON public.room_members;
CREATE POLICY "room_members_delete_self_or_host"
ON public.room_members
FOR DELETE
TO authenticated
USING (user_id = auth.uid() OR public.is_room_host(room_id));

DROP POLICY IF EXISTS "room_results_select_room" ON public.room_results;
CREATE POLICY "room_results_select_room"
ON public.room_results
FOR SELECT
TO authenticated
USING (public.is_room_member(room_id) OR public.is_room_host(room_id));

DROP POLICY IF EXISTS "room_results_insert_self" ON public.room_results;
CREATE POLICY "room_results_insert_self"
ON public.room_results
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.is_room_member(room_id)
);

DROP POLICY IF EXISTS "room_results_update_self" ON public.room_results;
