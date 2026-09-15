const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

export const VARIETIES = [
  {
    slug: 'bernie',
    name: 'Bernie',
    tag: 'lahůdková, salátová, varný typ A',
    description:
      'Pevná žlutá dužnina, nerozvařuje se. Ideální na bramborový salát a vařené v páře s máslem.',
    colorHex: '#c98a2b',
    price: 22,
    stock: 148,
    capacity: 160,
  },
  {
    slug: 'marabel',
    name: 'Marabel',
    tag: 'polopozdní, varný typ AB',
    description:
      'Univerzálka do každé kuchyně — na kaši, hranolky i pečení. Skladuje se přes zimu bez problémů.',
    colorHex: '#8a9a3f',
    price: 17,
    stock: 132,
    capacity: 170,
  },
  {
    slug: 'red-anna',
    name: 'Red Anna',
    tag: 'červená slupka, varný typ B',
    description: 'Červená slupka, máslová chuť. Krásná pečená celá se solí a rozmarýnem.',
    colorHex: '#a9642e',
    price: 19,
    stock: 64,
    capacity: 140,
  },
  {
    slug: 'agria',
    name: 'Agria',
    tag: 'pozdní, varný typ B',
    description:
      'Poslední záhon sezóny. Vykopeme koncem září, čekáme kolem 150 kg.',
    colorHex: '#6f8f5a',
    price: 16,
    stock: 0,
    capacity: 150,
  },
] as const

export const NEWS = [
  {
    title: 'Dnes jsme vykopali Bernie',
    body: 'Jsou to skvělé lahůdkové brambory na salát, té nejvyšší kvality — zasazené, pěstované a sklizené s největší láskou. Velikost hlíz je od 1 mm do velikosti pěsti středně vzrostlého muže.',
    tag: 'HARVEST' as const,
    publishedAt: day('2026-09-09'),
  },
  {
    title: 'Stodola je vychlazená na 6 °C',
    body: 'Dokoupili jsme čidla, teplotu i vlhkost teď hlídáme nepřetržitě. Brambory tak vydrží křupavé až do jara.',
    tag: 'STORAGE' as const,
    publishedAt: day('2026-09-05'),
  },
  {
    title: 'Agria potřebuje ještě tři týdny',
    body: 'Natě jsou pořád zelené, necháme hlízy dorůst. Předpokládaný výkop je kolem 25. září, čekáme kolem 150 kg.',
    tag: 'FIELD' as const,
    publishedAt: day('2026-09-01'),
  },
]

export const FIELDS = [
  { name: 'Záhon za stodolou', varietyName: 'Bernie', areaM2: 180, status: 'HARVESTED' as const, yieldKg: 148, isEstimate: false },
  { name: 'Záhon u lesa', varietyName: 'Marabel', areaM2: 200, status: 'HARVESTED' as const, yieldKg: 132, isEstimate: false },
  { name: 'Nad potokem', varietyName: 'Red Anna', areaM2: 90, status: 'HARVESTING' as const, yieldKg: 64, isEstimate: false },
  { name: 'Dolní díl', varietyName: 'Agria', areaM2: 190, status: 'GROWING' as const, yieldKg: 150, isEstimate: true },
  { name: 'Kamenec', varietyName: 'Sadba 2027', areaM2: 60, status: 'GROWING' as const, yieldKg: 40, isEstimate: true },
]

export const HARVEST: Array<[string, number, number]> = [
  ['2026-08-27', 0, 38],
  ['2026-08-28', 42, 74],
  ['2026-08-29', 0, 68],
  ['2026-08-30', 55, 118],
  ['2026-08-31', 0, 110],
  ['2026-09-01', 0, 97],
  ['2026-09-02', 48, 140],
  ['2026-09-03', 0, 131],
  ['2026-09-04', 62, 188],
  ['2026-09-05', 0, 174],
  ['2026-09-06', 36, 203],
  ['2026-09-07', 0, 191],
  ['2026-09-08', 0, 182],
  ['2026-09-09', 148, 344],
]

/**
 * Historické objednávky. Kódy se **nezapisují ručně** — odvodí se z `id` stejným
 * pravidlem, jaké používá aplikace. Dvě definice jednoho kódu by se dřív nebo
 * později rozešly.
 */
export const ORDERS = [
  {
    customerName: 'Jiří Malý',
    customerEmail: 'jiri.maly@email.cz',
    customerPhone: '+420 605 111 222',
    note: '',
    deliveryMethod: 'PICKUP' as const,
    paymentMethod: 'CASH' as const,
    status: 'COLLECTED' as const,
    paid: true,
    items: [{ slug: 'bernie', quantity: 2.5 }],
  },
  {
    customerName: 'Restaurace U Lípy',
    customerEmail: 'objednavky@ulipy.cz',
    customerPhone: '+420 733 444 555',
    note: 'Fakturu prosím e-mailem.',
    deliveryMethod: 'LOCAL_DELIVERY' as const,
    paymentMethod: 'BANK_TRANSFER' as const,
    status: 'READY' as const,
    paid: true,
    items: [
      { slug: 'bernie', quantity: 20 },
      { slug: 'red-anna', quantity: 5 },
    ],
  },
  {
    customerName: 'Petra Dvořáková',
    customerEmail: 'petra.d@email.cz',
    customerPhone: '+420 776 888 999',
    note: 'Přijedu v sobotu dopoledne.',
    deliveryMethod: 'LOCAL_DELIVERY' as const,
    paymentMethod: 'QR_CODE' as const,
    status: 'NEW' as const,
    paid: false,
    items: [{ slug: 'marabel', quantity: 7.5 }],
  },
]
