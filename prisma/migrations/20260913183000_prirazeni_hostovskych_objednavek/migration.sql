-- Objednávky se nově párují k účtu výhradně přes `user_id`. E-mail na objednávce je
-- neověřený údaj z formuláře — hostovskou objednávkou na cizí adresu si kdokoli
-- připisoval cizímu účtu historii i útratu v administraci.
--
-- Účty ověřené ještě před touto změnou by tím přišly o objednávky z doby před
-- registrací, které dosud viděly. Přiřadí se jim proto zpětně, podle stejného
-- pravidla, jaké od teď používá ověření e-mailu (VerifyEmail): jen objednávka bez
-- vlastníka, jen na ověřenou adresu účtu a jen taková, která vznikla dřív než účet.
--
-- Pozor při nasazení na živá data: ověření prokazuje vlastnictví adresy, ne původ
-- objednávky. Pokud někdo cizí zadal objednávku na adresu zákazníka ještě před jeho
-- registrací, tenhle příkaz ji účtu připíše taky. Na prázdné databázi je to bez
-- dopadu; nad živými daty si napřed pusťte stejný SELECT a podívejte se, čeho se to týká.
UPDATE `orders` o
  JOIN `users` u ON u.email = o.customer_email
SET o.user_id = u.id
WHERE o.user_id IS NULL
  AND u.verified_at IS NOT NULL
  AND o.created_at < u.created_at;
