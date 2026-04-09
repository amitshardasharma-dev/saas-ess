import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await params

		const { data: claim } = await supabaseAdmin
			.from('ess_expense_claims')
			.select('id')
			.eq('display_id', id)
			.single()

		if (!claim) {
			return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
		}

		const { data: items, error } = await supabaseAdmin
			.from('ess_expense_items')
			.select(`
				*,
				ess_expense_categories (code, name)
			`)
			.eq('expense_claim_id', claim.id)
			.order('expense_date')

		if (error) throw error

		return NextResponse.json({ items: items || [] })
	} catch (error) {
		console.error('Expense items fetch error:', error)
		return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 })
	}
}

export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await params
		const body = await request.json()

		const { data: claim } = await supabaseAdmin
			.from('ess_expense_claims')
			.select('id, status')
			.eq('display_id', id)
			.single()

		if (!claim) {
			return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
		}

		if (claim.status !== 'Draft') {
			return NextResponse.json({ error: 'Can only add items to draft claims' }, { status: 400 })
		}

		const { data: newItem, error: insertError } = await supabaseAdmin
			.from('ess_expense_items')
			.insert({
				expense_claim_id: claim.id,
				category_id: body.category_id,
				description: body.description,
				amount: body.amount,
				expense_date: body.expense_date,
				receipt_url: body.receipt_url || null,
				receipt_filename: body.receipt_filename || null,
				has_receipt: !!body.receipt_url,
			})
			.select()
			.single()

		if (insertError) throw insertError

		// Recalculate total
		const { data: allItems } = await supabaseAdmin
			.from('ess_expense_items')
			.select('amount')
			.eq('expense_claim_id', claim.id)

		const total = (allItems || []).reduce((sum, item) => sum + Number(item.amount), 0)

		await supabaseAdmin
			.from('ess_expense_claims')
			.update({ total_amount: total, updated_at: new Date().toISOString() })
			.eq('id', claim.id)

		return NextResponse.json({ item: newItem, new_total: total })
	} catch (error) {
		console.error('Add expense item error:', error)
		return NextResponse.json({ error: 'Failed to add item' }, { status: 500 })
	}
}

export async function DELETE(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await params
		const { searchParams } = new URL(request.url)
		const itemId = searchParams.get('itemId')

		if (!itemId) {
			return NextResponse.json({ error: 'Item ID required' }, { status: 400 })
		}

		const { data: claim } = await supabaseAdmin
			.from('ess_expense_claims')
			.select('id, status')
			.eq('display_id', id)
			.single()

		if (!claim || claim.status !== 'Draft') {
			return NextResponse.json({ error: 'Can only delete items from draft claims' }, { status: 400 })
		}

		await supabaseAdmin.from('ess_expense_items').delete().eq('id', itemId)

		// Recalculate total
		const { data: allItems } = await supabaseAdmin
			.from('ess_expense_items')
			.select('amount')
			.eq('expense_claim_id', claim.id)

		const total = (allItems || []).reduce((sum, item) => sum + Number(item.amount), 0)

		await supabaseAdmin
			.from('ess_expense_claims')
			.update({ total_amount: total, updated_at: new Date().toISOString() })
			.eq('id', claim.id)

		return NextResponse.json({ message: 'Item deleted', new_total: total })
	} catch (error) {
		console.error('Delete expense item error:', error)
		return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 })
	}
}
