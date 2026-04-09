import { screen, fireEvent } from '@testing-library/react'
import { render } from '../test-utils'
import { DocumentCard } from '@/components/documents/document-card'

const baseDoc = {
  id: 'doc-1',
  company_id: 'c1',
  category_id: 'cat-1',
  category_name: 'Company Policies',
  title: 'Employee Handbook',
  description: 'Complete employee handbook',
  current_version: 2,
  access_roles: ['employee'],
  is_published: true,
  requires_acknowledgment: true,
  published_at: '2026-01-01',
  created_by: 'e1',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  latest_version: {
    id: 'v1', document_id: 'doc-1', version_number: 2,
    file_url: 'https://example.com/file.pdf', file_name: 'handbook.pdf',
    file_size: 1024, uploaded_by: 'e1', uploaded_at: '2026-01-01', changelog: null,
  },
  acknowledged: false,
}

describe('DocumentCard', () => {
  it('renders title and category', () => {
    render(<DocumentCard document={baseDoc} onClick={jest.fn()} />)
    expect(screen.getByText('Employee Handbook')).toBeInTheDocument()
    expect(screen.getByText('Company Policies')).toBeInTheDocument()
  })

  it('renders version number', () => {
    render(<DocumentCard document={baseDoc} onClick={jest.fn()} />)
    expect(screen.getByText('v2')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = jest.fn()
    render(<DocumentCard document={baseDoc} onClick={onClick} />)
    fireEvent.click(screen.getByText('Employee Handbook'))
    expect(onClick).toHaveBeenCalledWith(baseDoc)
  })

  it('renders description when provided', () => {
    render(<DocumentCard document={baseDoc} onClick={jest.fn()} />)
    expect(screen.getByText('Complete employee handbook')).toBeInTheDocument()
  })
})
