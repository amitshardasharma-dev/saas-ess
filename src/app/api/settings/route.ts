import { NextRequest, NextResponse } from 'next/server';
import config from '@/config/environment';

interface FrappeAppSettingsDoc {
  data: {
    name: string;
    next_erp_url: string;
    next_public_frappe_url: string;
    next_public_frappe_site_name: string;
    next_public_app_name: string;
    next_public_app_description: string;
    next_public_session_timeout: number;
    next_public_remember_me_days: number;
    next_auth_secret: string;
    next_auth_url: string;
    next_use_erp: string;
    next_custom1: string;
  };
}



export async function GET(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get('Cookie');

    const frappeUrl = `${config.frappe.url.replace(/\/$/, '')}/api/resource/AppSettings/AppSettings`;

    const response = await fetch(frappeUrl, {
      method: 'GET',
      headers: {
        ...(cookieHeader && { Cookie: cookieHeader }),
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'AppSettings not found' },
          { status: 404 }
        );
      }
      throw new Error(`Frappe API error: ${response.status}`);
    }

    const settingsDoc: FrappeAppSettingsDoc = await response.json();

    const processedResult = {
      settings: {
        next_erp_url: settingsDoc.data.next_erp_url,
        next_public_frappe_url: settingsDoc.data.next_public_frappe_url,
        next_public_frappe_site_name: settingsDoc.data.next_public_frappe_site_name,
        next_public_app_name: settingsDoc.data.next_public_app_name,
        next_public_app_description: settingsDoc.data.next_public_app_description,
        next_public_session_timeout: settingsDoc.data.next_public_session_timeout,
        next_public_remember_me_days: settingsDoc.data.next_public_remember_me_days,
        next_auth_secret: settingsDoc.data.next_auth_secret,
        next_auth_url: settingsDoc.data.next_auth_url,
        next_use_erp: settingsDoc.data.next_use_erp,
        next_custom1: settingsDoc.data.next_custom1,
      },
    };

    return NextResponse.json(processedResult);
  } catch (error) {
    console.error('AppSettings fetch error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch settings data', details: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get('Cookie');
    const updates = await request.json();

    const frappeUrl = `${config.frappe.url.replace(/\/$/, '')}/api/resource/AppSettings/AppSettings`;

    const response = await fetch(frappeUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader && { Cookie: cookieHeader }),
      },
      body: JSON.stringify({ data: updates }),
    });

    if (!response.ok) {
      throw new Error(`Frappe API error: ${response.status}`);
    }

    const updatedDoc: FrappeAppSettingsDoc = await response.json();

    return NextResponse.json({
      settings: updatedDoc.data,
      message: 'Settings updated successfully',
    });
  } catch (error) {
    console.error('AppSettings update error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to update settings', details: errorMessage },
      { status: 500 }
    );
  }
}