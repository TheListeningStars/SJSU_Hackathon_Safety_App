import { Redirect } from 'expo-router';

// Google sign-in returns here (packtrackapp://auth-callback). sign-in.tsx finishes the login; this
// route only exists so the deep link doesn't land on "page not found".
export default function AuthCallback() {
  return <Redirect href="/" />;
}
