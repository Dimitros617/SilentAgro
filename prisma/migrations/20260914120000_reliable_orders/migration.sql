ALTER TABLE `orders`
  ADD COLUMN `discount_czk` DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN `pricing_version` INTEGER NOT NULL DEFAULT 1;

CREATE TABLE `reservation_requests` (
  `request_key` VARCHAR(64) NOT NULL,
  `fingerprint` CHAR(64) NOT NULL,
  `order_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`request_key`),
  UNIQUE INDEX `reservation_requests_order_id_key` (`order_id`),
  CONSTRAINT `reservation_requests_order_id_fkey` FOREIGN KEY (`order_id`)
    REFERENCES `orders` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `mail_outbox` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `message_key` VARCHAR(160) NOT NULL,
  `payload` JSON NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `available_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `locked_until` DATETIME(3) NULL,
  `lease_token` VARCHAR(64) NULL,
  `sent_at` DATETIME(3) NULL,
  `last_error` VARCHAR(1000) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `mail_outbox_message_key_key` (`message_key`),
  INDEX `mail_outbox_sent_at_available_at_locked_until_idx` (`sent_at`, `available_at`, `locked_until`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
