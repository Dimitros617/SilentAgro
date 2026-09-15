import path from 'node:path'
import { builtinModules } from 'node:module'
import { allowedLayers } from '../architecture/layers.mjs'

const srcRoot = path.resolve(import.meta.dirname, '../src')

const serverPackages = ['@prisma/client', 'prisma', 'nodemailer', 'bcryptjs', 'server-only', 'next/headers', 'next/cache', 'next/server']

function isServerImport(target) {
  if (target.startsWith('node:') || builtinModules.includes(target)) return true
  return serverPackages.some(name => target === name || target.startsWith(`${name}/`))
}

function isTypeOnlyImport(node) {
  if (node.type === 'TSImportType' || node.importKind === 'type' || node.exportKind === 'type') return true
  return node.specifiers?.length > 0 && node.specifiers.every(specifier => specifier.importKind === 'type' || specifier.exportKind === 'type')
}

function sourcePath(filename) {
  return path.relative(srcRoot, filename).replaceAll('\\', '/')
}

/** Rozlouskne aliasy i relativní cesty, včetně typových a dynamických importů. */
const layerDependencies = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      dependency: 'Vrstva {{layer}} nesmí importovat {{target}}. Použijte port nebo předejte data.',
      environment: 'Prostředí se nesmí číst ve vrstvě {{layer}}. Předejte konfiguraci jako závislost.',
    },
  },
  create(context) {
    const filename = context.getPhysicalFilename()
    const layer = sourcePath(filename).split('/')[0]
    const allowed = allowedLayers[layer]
    if (!allowed) return {}
    const pure = ['shared', 'domain', 'application'].includes(layer)
    const environmentForbidden = pure || layer === 'components'

    function checkImport(node) {
      const argument = node.source ?? node.argument ?? node.parameter ?? node.arguments?.[0]
      const source = argument?.type === 'TSLiteralType' ? argument.literal : argument
      if (typeof source?.value !== 'string') return
      const target = source.value
      let resolved
      if (target.startsWith('@/')) resolved = path.resolve(srcRoot, target.slice(2))
      else if (target.startsWith('.')) resolved = path.resolve(path.dirname(filename), target)

      if (resolved) {
        const relative = sourcePath(resolved)
        const targetLayer = relative.split('/')[0]
        // Server actions jsou v Next.js výslovná hranice mezi prohlížečem a serverem.
        if (layer === 'components' && relative.startsWith('app/actions/')) return
        // Komponenta přebírá DTO; serverový use-case sestavuje až stránka nebo action.
        if (layer === 'components' && relative.replace(/\.tsx?$/, '') === 'application/dto' && isTypeOnlyImport(node)) return
        if (allowed.includes(targetLayer)) return
      } else if (!pure && !(layer === 'components' && isServerImport(target))) {
        return
      }

      context.report({ node: source, messageId: 'dependency', data: { layer, target } })
    }

    return {
      ImportDeclaration: checkImport,
      ExportNamedDeclaration: checkImport,
      ExportAllDeclaration: checkImport,
      ImportExpression: checkImport,
      TSImportType: checkImport,
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require') checkImport(node)
      },
      MemberExpression(node) {
        if (!environmentForbidden || node.object.type !== 'Identifier' || node.object.name !== 'process') return
        const property = node.computed ? node.property.value : node.property.name
        if (property === 'env') context.report({ node, messageId: 'environment', data: { layer } })
      },
      VariableDeclarator(node) {
        if (!environmentForbidden || node.init?.type !== 'Identifier' || node.init.name !== 'process' || node.id.type !== 'ObjectPattern') return
        for (const property of node.id.properties) {
          if (property.type !== 'Property') continue
          const name = property.computed ? property.key.value : property.key.name
          if (name === 'env') context.report({ node: property, messageId: 'environment', data: { layer } })
        }
      },
    }
  },
}

const plugin = { rules: { 'layer-dependencies': layerDependencies } }

export default plugin
