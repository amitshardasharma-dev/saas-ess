/**
 * @jest-environment node
 */
import { resolveLabels, makeLabelFn } from '@/lib/labels/resolve'
import { DEFAULT_LABELS } from '@/lib/labels/defaults'

describe('terminology resolver', () => {
  it('returns platform defaults when there are no overrides (unknown tenant)', () => {
    const labels = resolveLabels([])
    expect(labels.person).toEqual(DEFAULT_LABELS.person)
    const t = makeLabelFn(labels)
    expect(t('person')).toBe(DEFAULT_LABELS.person.singular)
    expect(t('person', { plural: true })).toBe(DEFAULT_LABELS.person.plural)
  })

  it('applies an override and keeps untouched keys as defaults', () => {
    const labels = resolveLabels([
      { term_key: 'person', singular: 'Volunteer', plural: 'Volunteers' },
    ])
    const t = makeLabelFn(labels)
    expect(t('person')).toBe('Volunteer')
    expect(t('person', { plural: true })).toBe('Volunteers')
    expect(t('document')).toBe(DEFAULT_LABELS.document.singular)
  })

  it('ignores unknown term keys in overrides', () => {
    const labels = resolveLabels([
      { term_key: 'not_a_real_key', singular: 'X', plural: 'Xs' },
    ])
    expect(labels.person).toEqual(DEFAULT_LABELS.person)
  })
})
