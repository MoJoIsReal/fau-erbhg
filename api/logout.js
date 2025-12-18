import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  setCookie
} from './_shared/middleware.js';

export default async function handler(req, res) {
  // Apply security headers and handle CORS
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Clear JWT cookie (HttpOnly)
    setCookie(res, 'jwt', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 0, // Expire immediately
      path: '/'
    });

    // Clear CSRF token cookie
    setCookie(res, 'csrf-token', '', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 0, // Expire immediately
      path: '/'
    });

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    return handleError(res, error);
  }
}
