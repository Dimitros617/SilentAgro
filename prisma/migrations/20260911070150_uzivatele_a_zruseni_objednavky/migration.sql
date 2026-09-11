-- Ověření registrace e-mailem a deaktivace účtu.
-- Všechny sloupce jsou nullable: stávající účty zůstanou neověřené a aktivní,
-- což je správný výchozí stav, ne domněnka.
ALTER TABLE `users`
  ADD COLUMN `verified_at` DATETIME(3) NULL,
  ADD COLUMN `verification_token` VARCHAR(64) NULL,
  ADD COLUMN `verification_expires_at` DATETIME(3) NULL,
  ADD COLUMN `deactivated_at` DATETIME(3) NULL;

CREATE UNIQUE INDEX `users_verification_token_key` ON `users`(`verification_token`);
CREATE INDEX `users_deactivated_at_idx` ON `users`(`deactivated_at`);

-- Zrušení objednávky. Nezávislé na `status`, aby se neztratila informace,
-- v jakém stavu objednávka byla. `cancelled_at` je zároveň pojistkou proti
-- dvojímu vrácení množství do skladu.
ALTER TABLE `orders`
  ADD COLUMN `cancelled_at` DATETIME(3) NULL,
  ADD COLUMN `cancellation_reason` TEXT NULL;

CREATE INDEX `orders_cancelled_at_idx` ON `orders`(`cancelled_at`);
