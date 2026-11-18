import { createBrowserLocalDevelopmentOwnerIdentityPort } from '../src/infrastructure/local-owner-identity'

let rejected = false
try {
  createBrowserLocalDevelopmentOwnerIdentityPort()
} catch (error) {
  rejected = error instanceof Error
    && error.message === 'local-owner-identity-disabled-outside-development'
}
if (!rejected) throw new Error('production-local-owner-identity-guard-not-enforced')
console.log('Local owner identity production guard: passed')
