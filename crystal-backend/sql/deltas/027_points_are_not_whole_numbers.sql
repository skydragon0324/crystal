-- 027  Points are not whole numbers

-- Crystal's own point ledger was declared in integers, and the four systems
-- it sits beside were not.  ora_pid.activity_point_log.points is
-- NUMERIC(8,1) and the soft-point family's pay_points/soft_points are
-- NUMERIC(10,3) and NUMERIC(8,3) - so a member's points screen showed four
-- exact figures and one that had been rounded on the way in.
--
-- 0.4 points became 0.  Not rounded in the page, rounded in the COLUMN: the
-- service did Math.round() before the insert because anything else was a
-- 22P02 from PostgreSQL, and the log then recorded a movement that never
-- happened.  Award four tenths of a point ten times and the ledger says the
-- member earned nothing, which is a balance nobody can argue with because
-- there is no row disagreeing with it.
--
-- THREE DECIMALS, because that is the widest of the vendor's scales and the
-- ledgers have to be comparable to be shown on one screen.  It is not a
-- guess at a future requirement: soft_points is NUMERIC(8,3) today.
--
-- WIDER, NOT NARROWER, so every existing row survives unchanged - an integer
-- is a numeric(14,3) with three zeroes after it, and no value can fail to
-- convert.  That is what makes this safe to run on a live database, and it
-- is why the ALTERs need no USING clause.
--
-- MONEY IS NOT TOUCHED.  wallets.balance and wallet_transactions.amount have
-- always been numeric(14,2), which is correct for money and wrong for
-- points; the two are different quantities and keep different scales.

ALTER TABLE point_logs ALTER COLUMN amount        TYPE numeric(14,3);
ALTER TABLE point_logs ALTER COLUMN balance_after TYPE numeric(14,3);

ALTER TABLE wallets    ALTER COLUMN point_balance TYPE numeric(14,3);
ALTER TABLE wallets    ALTER COLUMN point_balance SET DEFAULT 0;

COMMENT ON COLUMN point_logs.amount IS
  'signed as well. LICENSE and WARRANTY_EXTENSION are negative - they spend points.
   numeric, not integer: the vendor awards tenths and thousandths of a point and
   rounding them here loses the movement rather than displaying it differently.';
