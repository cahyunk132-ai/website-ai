/**
 * Hyunk AI Hub - security.txt
 *
 * Standard contact information for security researchers.
 * See: https://securitytxt.org/
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export async function GET() {
  const securityTxt = `# Hyunk AI Hub Security Contact
# If you find a security vulnerability, please report it responsibly.

Contact: https://github.com/cahyunk132-ai
Expires: 2027-10-01T23:59:59.000Z
Preferred-Languages: id, en
Canonical: https://website-ai-tau.vercel.app/.well-known/security.txt
Policy: https://github.com/cahyunk132-ai/website-ai/blob/main/SECURITY.md

# Thank you for helping keep Hyunk AI Hub secure!
`;

  return new NextResponse(securityTxt, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
