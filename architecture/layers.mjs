// Společná definice směru závislostí pro ESLint a dependency-cruiser.
// Vrstva app sestavuje aplikaci; proto její importy nejsou omezené touto mapou.
export const allowedLayers = {
  shared: ['shared'],
  domain: ['domain', 'shared'],
  application: ['application', 'domain', 'shared'],
  infrastructure: ['infrastructure', 'application', 'domain', 'shared'],
  components: ['components', 'domain', 'shared'],
}
