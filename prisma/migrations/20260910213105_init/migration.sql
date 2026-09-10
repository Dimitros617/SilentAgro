-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `role` ENUM('CUSTOMER', 'FARMER') NOT NULL DEFAULT 'CUSTOMER',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `varieties` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(80) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `tag` VARCHAR(160) NOT NULL,
    `description` TEXT NOT NULL,
    `color_hex` CHAR(7) NOT NULL,
    `price_per_kg_czk` DECIMAL(10, 2) NOT NULL,
    `stock_kg` DECIMAL(10, 2) NOT NULL,
    `capacity_kg` DECIMAL(10, 2) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `varieties_slug_key`(`slug`),
    INDEX `varieties_is_active_sort_order_idx`(`is_active`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(32) NOT NULL,
    `public_token` VARCHAR(64) NOT NULL,
    `customer_name` VARCHAR(120) NOT NULL,
    `customer_email` VARCHAR(255) NOT NULL,
    `customer_phone` VARCHAR(40) NOT NULL,
    `note` TEXT NOT NULL,
    `delivery_method` ENUM('PICKUP', 'LOCAL_DELIVERY') NOT NULL,
    `payment_method` ENUM('CASH', 'BANK_TRANSFER', 'QR_CODE') NOT NULL,
    `subtotal_czk` DECIMAL(10, 2) NOT NULL,
    `delivery_fee_czk` DECIMAL(10, 2) NOT NULL,
    `total_czk` DECIMAL(10, 2) NOT NULL,
    `status` ENUM('NEW', 'READY', 'COLLECTED') NOT NULL DEFAULT 'NEW',
    `paid_at` DATETIME(3) NULL,
    `user_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `orders_code_key`(`code`),
    UNIQUE INDEX `orders_public_token_key`(`public_token`),
    INDEX `orders_status_created_at_idx`(`status`, `created_at`),
    INDEX `orders_paid_at_idx`(`paid_at`),
    INDEX `orders_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `variety_id` INTEGER NOT NULL,
    `variety_name` VARCHAR(120) NOT NULL,
    `unit_price_czk` DECIMAL(10, 2) NOT NULL,
    `quantity_kg` DECIMAL(10, 2) NOT NULL,
    `line_total_czk` DECIMAL(10, 2) NOT NULL,

    INDEX `order_items_order_id_idx`(`order_id`),
    INDEX `order_items_variety_id_idx`(`variety_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `news_posts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(200) NOT NULL,
    `body` TEXT NOT NULL,
    `tag` ENUM('HARVEST', 'STORAGE', 'FIELD') NOT NULL,
    `image_url` VARCHAR(300) NULL,
    `published_at` DATETIME(3) NOT NULL,
    `author_id` INTEGER NULL,

    INDEX `news_posts_published_at_idx`(`published_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fields` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `variety_name` VARCHAR(120) NOT NULL,
    `area_m2` INTEGER NOT NULL,
    `status` ENUM('GROWING', 'HARVESTING', 'HARVESTED') NOT NULL,
    `yield_kg` DECIMAL(10, 2) NOT NULL,
    `is_estimate` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `harvest_entries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATE NOT NULL,
    `dug_kg` DECIMAL(10, 2) NOT NULL,
    `stock_kg` DECIMAL(10, 2) NOT NULL,

    UNIQUE INDEX `harvest_entries_date_key`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `storage_readings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `recorded_at` DATETIME(3) NOT NULL,
    `temperature_c` DECIMAL(4, 1) NOT NULL,
    `humidity_pct` INTEGER NOT NULL,

    INDEX `storage_readings_recorded_at_idx`(`recorded_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_variety_id_fkey` FOREIGN KEY (`variety_id`) REFERENCES `varieties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `news_posts` ADD CONSTRAINT `news_posts_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
