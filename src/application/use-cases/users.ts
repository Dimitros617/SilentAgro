import type { OrderRowView, UserDetailView, UserRowView } from '@/application/dto'
import { toOrderRow, toUserRow } from '@/application/view-models'
import { verificationExpiry } from '@/application/verification-policy'
import { UserRole } from '@/domain/enums'
import { ConflictError, NotFoundError, ValidationError } from '@/domain/errors'
import type { UserNotifier } from '@/domain/ports/order-presentation'
import type { Clock, TokenGenerator } from '@/domain/ports/services'
import type { RepositoryBundle } from '@/domain/ports/repositories'
import type { UnitOfWork } from '@/domain/ports/unit-of-work'
import type { User } from '@/domain/entities'
import type { Page, PageRequest, UserFilter } from '@/domain/ports/pagination'
import { clampPage, normalizePage } from '@/application/pagination'
import { normalizeListText } from '@/application/list-query'

/**
 * Ověřený účet si připíše hostovské objednávky na svou adresu z doby před registrací.
 * Hranicí je vznik účtu: co přišlo později, mohl na tu adresu poslat kdokoli, protože
 * e-mail v objednávce se nikde neověřuje.
 *
 * Ani ověření ale neprokazuje původ objednávky, jen vlastnictví adresy — objednávku,
 * kterou na ni před registrací zadal někdo cizí, si účet připíše taky, a od té chvíle
 * se počítá do jeho útraty. Zbytkové riziko je tedy úzké, ne nulové: útočník musí
 * objednávku podstrčit dřív, než účet vůbec vznikne, a na adresu, o které netuší,
 * že si k ní někdo účet založí. Co se tím zavřelo natvrdo, je podvrh kdykoli později —
 * na existující účet už hostovskou objednávkou dosáhnout nelze.
 */
const claimGuestOrders = (repos: RepositoryBundle, user: User): Promise<number> =>
  repos.orders.claimGuestOrders(user.id, user.email, user.createdAt)

export class ListUsers {
  constructor(private readonly deps: { uow: UnitOfWork }) {}

  async execute(
    input: Partial<PageRequest> = {},
    filter: UserFilter = { query: '', onlyProblems: false },
  ): Promise<Page<UserRowView>> {
    const { users } = this.deps.uow.repos
    const normalized = { ...filter, query: normalizeListText(filter.query) }
    const total = await users.countFiltered(normalized)
    const page = clampPage(normalizePage(input), total)
    const usersOnPage = await users.listPage(page, normalized)
    // Jeden hromadný souhrn pouze pro účty na aktuální stránce.
    const userIds = usersOnPage.map((user) => user.id)
    const stats = await users.orderStatsForUsers(userIds)
    const statsByUserId = new Map(stats.map((row) => [row.userId, row]))
    const items = usersOnPage.map((user) => toUserRow(user, statsByUserId.get(user.id)))

    return { ...page, total, items }
  }
}

export class GetUserDetail {
  constructor(private readonly deps: { uow: UnitOfWork }) {}

  async execute(userId: number, input: Partial<PageRequest> = {}): Promise<UserDetailView> {
    const { users, orders } = this.deps.uow.repos

    const user = await users.findById(userId)
    if (!user) throw new NotFoundError('Uživatel')

    const filter = { query: '', userId }
    const total = await orders.countFiltered(filter)
    const page = clampPage(normalizePage(input), total)
    const [stats, customerOrders] = await Promise.all([
      users.orderStatsForUser(user.id),
      orders.listPage(page, filter),
    ])

    const rows: OrderRowView[] = customerOrders.map(toOrderRow)

    return {
      ...toUserRow(user, stats),
      orders: rows,
      ordersPage: { ...page, total },
    }
  }
}

/** Potvrzení e-mailu zákazníkem přes odkaz ze zprávy. */
export class VerifyEmail {
  constructor(private readonly deps: { uow: UnitOfWork; clock: Clock }) {}

  async execute(token: string): Promise<{ name: string; email: string }> {
    if (token.trim().length === 0) throw new NotFoundError('Ověřovací odkaz')

    return this.deps.uow.runInTransaction(async (repos) => {
      const user = await repos.users.lockByVerificationToken(token)
      if (!user) throw new NotFoundError('Ověřovací odkaz')

      // Prošlý odkaz se chová jako neexistující — hláška je stejná, aby z ní
      // nešlo poznat, jestli token někdy platil.
      const now = this.deps.clock.now()
      if (!user.canVerifyAt(now)) throw new NotFoundError('Ověřovací odkaz')

      const verified = await repos.users.save(user.withVerified(now))
      await claimGuestOrders(repos, verified)
      return { name: verified.name, email: verified.email.value }
    })
  }
}

/** Ruční ověření farmářem, když se zákazník k e-mailu nedostane. */
export class MarkUserVerified {
  constructor(private readonly deps: { uow: UnitOfWork; clock: Clock }) {}

  async execute(userId: number): Promise<UserRowView> {
    return this.deps.uow.runInTransaction(async (repos) => {
      const user = await repos.users.lockForUpdate(userId)
      if (!user) throw new NotFoundError('Uživatel')
      if (user.isVerified) throw new ConflictError('Účet už je ověřený')

      const verified = await repos.users.save(user.withVerified(this.deps.clock.now()))
      await claimGuestOrders(repos, verified)
      const stats = await repos.users.orderStatsForUser(userId)
      return toUserRow(verified, stats)
    })
  }
}

export class SetUserActive {
  constructor(private readonly deps: { uow: UnitOfWork; clock: Clock }) {}

  async execute(userId: number, active: boolean): Promise<UserRowView> {
    return this.deps.uow.runInTransaction(async (repos) => {
      const user = await repos.users.lockForUpdate(userId)
      if (!user) throw new NotFoundError('Uživatel')

      // Farmář si nesmí zamknout vlastní přístup do administrace.
      if (!active && user.role === UserRole.FARMER) {
        throw new ValidationError('Účet farmáře nelze deaktivovat')
      }

      const updated = await repos.users.save(user.withActive(active, this.deps.clock.now()))
      const stats = await repos.users.orderStatsForUser(userId)
      return toUserRow(updated, stats)
    })
  }
}

export class SendMessageToUser {
  constructor(private readonly deps: { uow: UnitOfWork; notifier: UserNotifier }) {}

  async execute(userId: number, subject: string, body: string): Promise<void> {
    const trimmedSubject = subject.trim()
    const trimmedBody = body.trim()

    if (trimmedSubject.length === 0) throw new ValidationError('Vyplňte předmět zprávy')
    if (trimmedBody.length === 0) throw new ValidationError('Napište text zprávy')

    const user = await this.deps.uow.repos.users.findById(userId)
    if (!user) throw new NotFoundError('Uživatel')

    // Tady se výjimka **nepolyká**: farmář musí vědět, že se zpráva neodeslala.
    // U potvrzení objednávky je to naopak — tam je pravdou sklad, ne e-mail.
    await this.deps.notifier.sendMessage(user, trimmedSubject, trimmedBody)
  }
}

/** Znovuposlání ověřovacího e-mailu. */
export class ResendVerification {
  constructor(
    private readonly deps: {
      uow: UnitOfWork
      clock: Clock
      tokenGenerator: TokenGenerator
      notifier: UserNotifier
      config: { publicBaseUrl: string }
    },
  ) {}

  async execute(userId: number): Promise<void> {
    const user = await this.deps.uow.runInTransaction(async (repos) => {
      const found = await repos.users.lockForUpdate(userId)
      if (!found) throw new NotFoundError('Uživatel')
      if (found.isVerified) throw new ConflictError('Účet už je ověřený')

      const token = this.deps.tokenGenerator.publicToken()
      return repos.users.save(
        found.withVerificationToken(token, verificationExpiry(this.deps.clock.now())),
      )
    })

    await this.deps.notifier.sendVerification(
      user,
      `${this.deps.config.publicBaseUrl}/overeni/${user.verificationToken ?? ''}`,
    )
  }
}
