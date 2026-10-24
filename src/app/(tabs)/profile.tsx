import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Card, ErrorText, Field, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { WalkPreference } from '@/components/walk-preference';
import { BottomTabInset, Spacing, type ThemeColor } from '@/constants/theme';
import { fetchContactInfo, updateContactInfo, updateProfile, type Gender, type VerificationStatus, type WalkWith } from '@/lib/api';
import { pickImage, uploadImage } from '@/lib/images';
import { useSession } from '@/providers/session';

const VERIFICATION: Record<VerificationStatus, { label: string; color: ThemeColor }> = {
  unverified: { label: 'Not verified', color: 'danger' },
  pending: { label: 'ID under review', color: 'warning' },
  verified: { label: 'Verified student', color: 'success' },
  rejected: { label: 'Verification rejected', color: 'danger' },
};

export default function ProfileScreen() {
  const { session, profile, refreshProfile, signOut } = useSession();
  const [phone, setPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userId = session?.user.id;
  const [prefSaved, setPrefSaved] = useState(false);

  const savePreference = async (next: { gender: Gender | null; walkWith: WalkWith }) => {
    if (!userId) return;
    setError(null);
    setPrefSaved(false);
    try {
      const locked = profile?.verification_status === 'verified';
      await updateProfile(userId, locked ? { walk_with: next.walkWith } : { gender: next.gender, walk_with: next.walkWith });
      await refreshProfile();
      setPrefSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    if (!userId) return;
    fetchContactInfo(userId)
      .then((c) => {
        setPhone(c?.phone ?? '');
        setInstagram(c?.instagram ?? '');
      })
      .catch((e: Error) => setError(e.message));
  }, [userId]);

  const changePhoto = async () => {
    if (!userId) return;
    try {
      const img = await pickImage({ source: 'library', square: true });
      if (!img) return;
      const path = await uploadImage('avatars', `${userId}/avatar-${Date.now()}.jpg`, img);
      await updateProfile(userId, { avatar_path: path });
      await refreshProfile();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const saveContact = async () => {
    if (!userId) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await updateContactInfo(userId, {
        phone: phone.trim() || null,
        instagram: instagram.trim().replace(/^@/, '') || null,
      });
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const verification = VERIFICATION[profile?.verification_status ?? 'unverified'];

  return (
    <Screen bottomInset={BottomTabInset}>
      <View style={styles.header}>
        <Avatar path={profile?.avatar_path} name={profile?.first_name} size={80} />
        <View style={styles.flex}>
          <ThemedText type="subtitle">{profile?.first_name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {session?.user.email}
          </ThemedText>
          <ThemedText type="smallBold" themeColor={verification.color}>
            {verification.label}
          </ThemedText>
        </View>
      </View>
      <Button title="Change photo" variant="outline" icon="camera-outline" onPress={changePhoto} />

      <Card>
        <WalkPreference
          gender={profile?.gender ?? null}
          walkWith={profile?.walk_with ?? 'anyone'}
          genderLocked={profile?.verification_status === 'verified'}
          onChange={savePreference}
        />
        {prefSaved && (
          <ThemedText type="small" themeColor="success">
            Saved. Applies to your next walk.
          </ThemedText>
        )}
      </Card>

      <Card>
        <ThemedText type="smallBold">Contact info</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Only shared with walk buddies who also chose to share with you. Your university email is included.
        </ThemedText>
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Field label="Instagram" value={instagram} onChangeText={setInstagram} autoCapitalize="none" />
        <Button title={saved ? 'Saved' : 'Save contact info'} onPress={saveContact} loading={saving} />
      </Card>

      <Button title="Campus safety dashboard" variant="outline" icon="stats-chart-outline" onPress={() => router.push('/admin')} />
      <ErrorText message={error} />
      <Button title="Sign out" variant="outline" onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  flex: {
    flex: 1,
  },
});
