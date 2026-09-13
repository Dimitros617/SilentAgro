-- Odvolání administrátorské session. Token je podepsaný na sedm dní a sám se
-- zneplatnit neumí, takže obnova hesla farmáře dosud ukradenou sušenku nezabila.
-- Nově si obnova hesla (prisma/seed.ts) do tohohle sloupce orazítkuje okamžik a
-- každý token vydaný dřív přestane na administrátorských cestách platit.
--
-- Sloupec je nullable a bez indexu: NULL na stávajících řádcích správně znamená
-- „nic se neodvolávalo", a čte se vždy až z řádku nalezeného přes primární klíč.
ALTER TABLE `users` ADD COLUMN `sessions_invalid_before` DATETIME(3) NULL;
