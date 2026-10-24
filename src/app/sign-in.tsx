// Welcome + sign in (Figma screen 1). Two ways in, both limited to .edu accounts:
//   * school Google (Supabase OAuth, PKCE; `hd` hints Google to show SJSU accounts)
//   * a one-time code emailed to a .edu address
// The enforce_edu_email trigger is what actually blocks other emails; checks here only give nicer errors.

import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ErrorText, Field } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

const EDU_EMAIL = /^[^\s@]+@([a-z0-9-]+\.)*[a-z0-9-]+\.edu$/i;
const SCHOOL_DOMAIN = 'sjsu.edu';
const brand = Colors.light;

export default function SignInScreen() {
  const theme = useTheme();
  const [mode, setMode] = useState<'choose' | 'email'>('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState<null | 'google' | 'email'>(null);
  const [error, setError] = useState<string | null>(null);

  const signInWithGoogle = async () => {
    setLoading('google');
    setError(null);
    try {
      const redirectTo = Linking.createURL('auth-callback');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: { hd: SCHOOL_DOMAIN, prompt: 'select_account' },
        },
      });
      if (error || !data.url) throw error ?? new Error('Could not start Google sign-in');
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') return;
      const params = callbackParams(result.url);
      const failure = params.get('error_description');
      if (failure) {
        // The .edu trigger rejects the account inside Supabase; say it plainly.
        throw new Error(/database error/i.test(failure) ? `Use your @${SCHOOL_DOMAIN} Google account.` : failure);
      }
      const authCode = params.get('code');
      if (!authCode) throw new Error('Google sign-in did not finish. Try again.');
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(authCode);
      if (exchangeError) throw exchangeError;
      // The session listener swaps this screen out.
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const sendCode = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!EDU_EMAIL.test(trimmed)) {
      setError('Use your university email address (it must end in .edu).');
      return;
    }
    setLoading('email');
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: trimmed });
    setLoading(null);
    if (error) setError(error.message);
    else setCodeSent(true);
  };

  const verifyCode = async () => {
    setLoading('email');
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'email',
    });
    setLoading(null);
    if (error) setError(error.message);
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll} bounces={false}>
          <Hero compact={mode === 'email'} />

          <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.body}>
            <ThemedText type="subtitle" style={styles.title}>
              Late night?{'\n'}Walk with your pack.
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              Meet fellow Spartans nearby, walk home together, and get rerouted around problems other students report.
            </ThemedText>

            {mode === 'choose' ? (
              <View style={styles.buttons}>
                <Button
                  title="Continue with school Google"
                  icon="logo-google"
                  onPress={signInWithGoogle}
                  loading={loading === 'google'}
                />
                <Button title="Sign in with SJSU email" variant="outline" icon="mail-outline" onPress={() => setMode('email')} />
              </View>
            ) : (
              <View style={styles.buttons}>
                <Field
                  label="University email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder={`you@${SCHOOL_DOMAIN}`}
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
                    <Button
                      title="Verify and continue"
                      onPress={verifyCode}
                      loading={loading === 'email'}
                      disabled={code.trim().length < 6}
                    />
                    <Button
                      title="Use a different email"
                      variant="outline"
                      onPress={() => {
                        setCodeSent(false);
                        setCode('');
                      }}
                    />
                  </>
                ) : (
                  <>
                    <Button title="Email me a sign-in code" onPress={sendCode} loading={loading === 'email'} />
                    <Button title="Back" variant="outline" onPress={() => setMode('choose')} />
                  </>
                )}
              </View>
            )}

            <ErrorText message={error} />

            <View style={[styles.notice, { backgroundColor: theme.backgroundSelected }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color={theme.accent} />
              <ThemedText type="small" style={styles.flex}>
                Spartans only. Sign in with your @{SCHOOL_DOMAIN} account. Student ID verification is required before
                you can be matched.
              </ThemedText>
            </View>
          </SafeAreaView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Query and hash parameters from the redirect URL (Supabase puts errors in either). */
function callbackParams(url: string) {
  const params = new URLSearchParams();
  const [beforeHash, hash = ''] = url.split('#');
  const query = beforeHash.split('?')[1] ?? '';
  for (const part of [query, hash]) new URLSearchParams(part).forEach((value, key) => params.set(key, value));
  return params;
}

function Hero({ compact }: { compact: boolean }) {
  return (
    <View style={[styles.hero, { height: compact ? 190 : 320 }]}>
      <SafeAreaView edges={['top']}>
        <View style={styles.brandRow}>
          <View style={styles.logo}>
            <Ionicons name="footsteps" size={18} color={brand.navy} />
          </View>
          <Text style={styles.brandText}>pack track</Text>
        </View>
      </SafeAreaView>
      {!compact && (
        <View style={styles.art}>
          <View style={styles.frame} />
          <View style={styles.cardShape} />
          <View style={styles.bubble}>
            <Ionicons name="people" size={24} color={brand.navy} />
          </View>
          <View style={styles.step}>
            <Ionicons name="footsteps" size={18} color={brand.accent} />
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>Better with a pack.</Text>
          </View>
        </View>
      )}
      <Text style={styles.uni}>SAN JOSÉ STATE UNIVERSITY</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  hero: { backgroundColor: brand.navy, paddingHorizontal: Spacing.four, justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: Spacing.three },
  logo: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: brand.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  art: { flex: 1 },
  frame: {
    position: 'absolute',
    left: 26,
    top: 22,
    width: 200,
    height: 110,
    borderWidth: 4,
    borderColor: brand.gold,
    borderRadius: Radius.sm,
  },
  cardShape: { position: 'absolute', left: 110, top: 56, width: 120, height: 92, backgroundColor: '#25517A', borderRadius: Radius.md },
  bubble: {
    position: 'absolute',
    left: 200,
    top: 32,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: brand.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  step: {
    position: 'absolute',
    left: 14,
    top: 96,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: { position: 'absolute', left: 124, top: 118, backgroundColor: '#fff', borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 12, color: brand.text },
  uni: { color: '#C3D3DD', fontSize: 11, letterSpacing: 0.5, marginBottom: Spacing.three },
  body: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  title: { marginTop: Spacing.one },
  buttons: { gap: Spacing.two, marginTop: Spacing.two },
  notice: { flexDirection: 'row', gap: 10, borderRadius: Radius.md, padding: 14, alignItems: 'flex-start' },
});
