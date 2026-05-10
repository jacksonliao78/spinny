-- Stats screen queries `runs` with `.eq('user_id', auth.uid())`.
-- If RLS is enabled on `public.runs` but there is no SELECT policy for authenticated users,
-- PostgREST returns **zero rows with no error** — the UI shows "No saved runs yet" even when rows exist.
--
-- Run this in Supabase SQL Editor (once per project). Adjust policy name if it conflicts.

DROP POLICY IF EXISTS "runs_select_own" ON public.runs;

CREATE POLICY "runs_select_own"
ON public.runs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
