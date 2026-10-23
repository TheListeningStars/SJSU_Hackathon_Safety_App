import { useState } from 'react';

import { Button } from '@/components/button';
import { ErrorText, Field, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/lib/supabase';

const EDU_EMAIL = /^[^\s@]+@([a-z0-9-]+\.)*[a-z0-9-]+\.edu$/i;

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!EDU_EMAIL.test(trimmed)) {
      setError('Use your university email address (it must end in .edu).');
      return;
    }
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: trimmed });
    setLoading(false);
    if (error) setError(error.message);
    else setCodeSent(true);
  };

  const verifyCode = async () => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'email',
    });
    setLoading(false);
    // On success the session listener swaps this screen out automatically.
    if (error) setError(error.message);
  };

  return (
    <Screen>
      <ThemedText type="subtitle">PackTrack</ThemedText>
      <ThemedText themeColor="textSecondary">
        Walk home with verified students from your campus. Sign in with your university email.
      </ThemedText>

      <Field
        label="University email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@sjsu.edu"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        editable={!codeSent}
      />

      {codeSent ? (
        <>
          <Field
            label="Code from your email"
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            maxLength={8}
          />
          <Button title="Verify and continue" onPress={verifyCode} loading={loading} disabled={code.trim().length < 6} />
          <Button
            title="Use a different email"
            variant="secondary"
            onPress={() => {
              setCodeSent(false);
              setCode('');
            }}
          />
        </>
      ) : (
        <Button title="Email me a sign-in code" onPress={sendCode} loading={loading} />
      )}

      <ErrorText message={error} />
    </Screen>
  );
}
