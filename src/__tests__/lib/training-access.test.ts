/**
 * @jest-environment node
 *
 * canTakeModule (MOS-858): the tracking and quiz-result gates accept the same
 * learners the learning view lists — assigned (rules + onboarding steps) or
 * required by a compliance requirement.
 */
jest.mock('@/lib/training/assignments', () => ({ isAssigned: jest.fn() }))
jest.mock('@/lib/compliance/register', () => ({ requiredModuleIdsForEmployee: jest.fn() }))

import { canTakeModule } from '@/lib/training/access'
import { isAssigned } from '@/lib/training/assignments'
import { requiredModuleIdsForEmployee } from '@/lib/compliance/register'

const assigned = isAssigned as jest.Mock
const required = requiredModuleIdsForEmployee as jest.Mock

describe('canTakeModule', () => {
  beforeEach(() => {
    assigned.mockReset()
    required.mockReset()
  })

  it('allows an assigned learner without checking compliance', async () => {
    assigned.mockResolvedValue(true)
    await expect(canTakeModule('co', 'e1', 'employee', 'mod-1')).resolves.toBe(true)
    expect(required).not.toHaveBeenCalled()
  })

  it('allows a learner the module is required for', async () => {
    assigned.mockResolvedValue(false)
    required.mockResolvedValue(['mod-0', 'mod-1'])
    await expect(canTakeModule('co', 'e1', 'hr', 'mod-1')).resolves.toBe(true)
    expect(required).toHaveBeenCalledWith('co', 'e1', 'hr')
  })

  it('refuses everyone else', async () => {
    assigned.mockResolvedValue(false)
    required.mockResolvedValue(['mod-2'])
    await expect(canTakeModule('co', 'e1', 'employee', 'mod-1')).resolves.toBe(false)
  })
})
