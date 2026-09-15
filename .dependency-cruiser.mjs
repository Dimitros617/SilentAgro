import { allowedLayers } from './architecture/layers.mjs'

const layerRules = []
for (const [layer, allowed] of Object.entries(allowedLayers)) {
  const allowedPaths = [`^src/(${allowed.join('|')})/`]
  if (layer === 'components') {
    // Server actions tvoří hranici prohlížeč–server; DTO se kontroluje zvlášť níže.
    allowedPaths.push('^src/app/actions/', '^src/application/dto\\.ts$')
  }
  layerRules.push({
    name: `${layer}-dependencies`,
    severity: 'error',
    from: { path: `^src/${layer}/` },
    to: { path: '^src/', pathNot: allowedPaths },
  })
}

const config = {
  forbidden: [
    ...layerRules,
    {
      name: 'no-unresolved-imports',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-circular-at-runtime',
      severity: 'error',
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ['type-only'] } },
    },
    {
      name: 'no-type-cycles',
      severity: 'warn',
      from: {},
      to: { circular: true, via: { dependencyTypes: ['type-only'] } },
    },
    {
      name: 'core-has-no-external-dependencies',
      severity: 'error',
      from: { path: '^src/(shared|domain|application)/' },
      to: { pathNot: '^src/(shared|domain|application)/', reachable: true },
    },
    {
      name: 'components-import-dto-as-types',
      severity: 'error',
      from: { path: '^src/components/' },
      to: { path: '^src/application/dto\\.ts$', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'production-does-not-import-dev-packages',
      severity: 'error',
      from: { path: '^src/' },
      to: { dependencyTypes: ['npm-dev'] },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
}

export default config
