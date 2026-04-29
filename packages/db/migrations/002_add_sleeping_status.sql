-- Add 'sleeping' status for runs suspended by sleep() / waitUntil()
ALTER TABLE runs DROP CONSTRAINT runs_status_check;
ALTER TABLE runs ADD CONSTRAINT runs_status_check
  CHECK (status IN ('pending','running','sleeping','completed','failed','cancelled'));
