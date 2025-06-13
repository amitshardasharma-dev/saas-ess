# ESS System - Employee Self Service

A modern Employee Self Service (ESS) system built with Next.js 15 and Frappe backend integration.

## Features

- ✅ **Secure Authentication** - Login with Frappe backend integration
- ✅ **Modern UI** - Built with shadcn/ui components and Tailwind CSS
- ✅ **Type Safety** - Full TypeScript support
- ✅ **State Management** - Zustand for efficient state management
- ✅ **Form Validation** - Zod schema validation
- ✅ **Responsive Design** - Mobile-first responsive design
- ✅ **Session Management** - Persistent authentication with remember me
- ✅ **Error Handling** - Comprehensive error handling and user feedback

## Tech Stack

- **Frontend**: Next.js 15 with App Router
- **Backend**: Frappe Framework
- **UI Library**: shadcn/ui components
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Form Validation**: Zod
- **HTTP Client**: Native fetch API
- **Typography**: Inter font
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js 18+ installed
- A running Frappe instance
- pnpm package manager (recommended)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ess
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Environment Setup**
   
   Create a `.env.local` file in the project root:
   ```env
   # Frappe Backend Configuration
   NEXT_PUBLIC_FRAPPE_URL=http://localhost:8000
   NEXT_PUBLIC_FRAPPE_SITE_NAME=your-site-name
   
   # Application Configuration
   NEXT_PUBLIC_APP_NAME=ESS System
   NEXT_PUBLIC_APP_DESCRIPTION=Employee Self Service System
   
   # Authentication Configuration
   NEXT_PUBLIC_SESSION_TIMEOUT=3600000
   NEXT_PUBLIC_REMEMBER_ME_DAYS=30
   
   # Security Configuration
   NEXTAUTH_SECRET=your-super-secret-key
   NEXTAUTH_URL=http://localhost:3000
   ```
   
   For detailed environment configuration, see [ENV_SETUP.md](./ENV_SETUP.md)

4. **Start the development server**
   ```bash
   pnpm dev
   ```

5. **Open the application**
   
   Navigate to [http://localhost:3000](http://localhost:3000) - you'll be automatically redirected to the login page.

## Usage

### Login Page

- Access the login page at `/login`
- Enter your Frappe username and password
- Use "Remember me" to stay logged in for extended periods
- Form includes validation and error handling

### Dashboard

- After successful login, users are redirected to `/dashboard`
- View user information and system details
- Access quick actions and system features
- Logout functionality in the header

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── login/             # Login page
│   ├── dashboard/         # Dashboard page
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── auth/             # Authentication components
│   └── ui/               # Reusable UI components
├── config/               # Configuration files
├── lib/                  # Utility functions
├── services/             # API services
├── stores/               # Zustand stores
└── types/                # TypeScript type definitions
```

## Configuration

All configuration is managed through environment variables. Key configurations include:

- **Frappe Backend**: Server URL and site name
- **Authentication**: Session timeout and remember me duration
- **Application**: App name and description
- **Security**: Session encryption secrets

See [ENV_SETUP.md](./ENV_SETUP.md) for complete configuration details.

## Development

### Available Scripts

```bash
pnpm dev          # Start development server
pnpm build        # Build for production
pnpm start        # Start production server
pnpm lint         # Run ESLint
```

### Code Standards

- TypeScript for type safety
- ESLint for code quality
- Prettier for code formatting
- Conventional commit messages

## Authentication Flow

1. User accesses any page
2. Authentication middleware checks session
3. Unauthenticated users redirected to `/login`
4. Login form validates credentials with Frappe
5. Successful login creates session and redirects to `/dashboard`
6. Session persists across browser sessions (if remember me is checked)

## API Integration

The application integrates with Frappe through REST API endpoints:

- **Login**: `POST /api/method/login`
- **Logout**: `POST /api/method/logout`
- **User Info**: `GET /api/method/frappe.auth.get_logged_user`
- **User Details**: `GET /api/resource/User/{username}`

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:

1. Check the [ENV_SETUP.md](./ENV_SETUP.md) for configuration help
2. Review the troubleshooting section in the environment setup
3. Check the application logs for error details
4. Contact your system administrator for Frappe-related issues
