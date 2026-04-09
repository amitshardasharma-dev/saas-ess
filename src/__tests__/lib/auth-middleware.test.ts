/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'

// Mock supabase-server
jest.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
    })),
  },
}))

import { supabaseAdmin } from '@/lib/supabase-server'

const mockRequest = (token?: string) => {
  const headers = new Headers()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return new NextRequest('http://localhost:3001/api/test', { headers })
}

const mockRouteContext = { params: Promise.resolve({}) }

describe('withAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 when no Authorization header', async () => {
    const handler = jest.fn()
    const wrapped = withAuth(handler)
    const res = await wrapped(mockRequest(), mockRouteContext)
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it('returns 401 when token is invalid', async () => {
    ;(supabaseAdmin.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: null }, error: { message: 'Invalid token' }
    })
    const handler = jest.fn()
    const wrapped = withAuth(handler)
    const res = await wrapped(mockRequest('bad-token'), mockRouteContext)
    expect(res.status).toBe(401)
  })

  it('returns 403 when user not registered for ESS', async () => {
    ;(supabaseAdmin.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'u1', email: 'test@test.com' } }, error: null
    })
    const fromMock = jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    }))
    ;(supabaseAdmin.from as jest.Mock) = fromMock
    const handler = jest.fn()
    const wrapped = withAuth(handler)
    const res = await wrapped(mockRequest('valid-token'), mockRouteContext)
    expect(res.status).toBe(403)
  })

  it('returns 403 when role is insufficient', async () => {
    ;(supabaseAdmin.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'u1', email: 'test@test.com' } }, error: null
    })
    let callCount = 0
    const fromMock = jest.fn(() => {
      callCount++
      if (callCount === 1) {
        // ess_app_users query
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: 'au1', company_id: 'c1', role: 'employee', is_active: true },
            error: null
          }),
        }
      }
      // ess_employees query
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { id: 'e1' }, error: null }),
      }
    })
    ;(supabaseAdmin.from as jest.Mock) = fromMock
    const handler = jest.fn()
    const wrapped = withAuth(handler, { minRole: 'admin' })
    const res = await wrapped(mockRequest('valid-token'), mockRouteContext)
    expect(res.status).toBe(403)
  })

  it('calls handler with AuthContext when auth succeeds', async () => {
    ;(supabaseAdmin.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'u1', email: 'test@test.com' } }, error: null
    })
    let callCount = 0
    const fromMock = jest.fn(() => {
      callCount++
      if (callCount === 1) {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: 'au1', company_id: 'c1', role: 'admin', is_active: true },
            error: null
          }),
        }
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'e1', full_name: 'Test', employee_no: 'E001' },
          error: null
        }),
      }
    })
    ;(supabaseAdmin.from as jest.Mock) = fromMock
    const { NextResponse } = require('next/server')
    const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }))
    const wrapped = withAuth(handler)
    const res = await wrapped(mockRequest('valid-token'), mockRouteContext)
    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
    const ctx = handler.mock.calls[0][1]
    expect(ctx.companyId).toBe('c1')
    expect(ctx.role).toBe('admin')
  })
})
