import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Card, ErrorText, Field, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { submitIdVerification, updateContactInfo, updateProfile } from '@/lib/api';
import { pickImage, uploadImage, type PickedImage } from '@/lib/images';
import { useSession } from '@/providers/session';

export default function OnboardingScreen() {
  const { session, profile, refreshProfile, signOut } = useSession();
  const [firstName, setFirstName] = useState(profile?.first_name ?? '');
  const [phone, setPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [avatar, setAvatar] = useState<PickedImage | null>(null);
  const [idFront, setIdFront] = useState<PickedImage | null>(null);
  const [selfie, setSelfie] = useState<PickedImage | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = session?.user.id;
  const ready = !!firstName.trim() && (!!avatar || !!profile?.avatar_path) && !!idFront && !!selfie;

  const choose = (setter: (img: PickedImage) => void, opts: Parameters<typeof pickImage>[0]) => async () => {
    try {
      const img = await pickImage(opts);
      if (img) setter(img);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const submit = async () => {
    if (!userId || !idFront || !selfie) return;
    setSaving(true);
    setError(null);
    try {
      const stamp = Date.now();
      const avatarPath = avatar
        ? await uploadImage('avatars', `${userId}/avatar-${stamp}.jpg`, avatar)
        : profile?.avatar_path ?? null;
      const idPath = await uploadImage('id-documents', `${userId}/id-front-${stamp}.jpg`, idFront);
      const selfiePath = await uploadImage('id-documents', `${userId}/selfie-${stamp}.jpg`, selfie);

      await updateProfile(userId, { first_name: firstName.trim(), avatar_path: avatarPath });
      await updateContactInfo(userId, {
        phone: phone.trim() || null,
        instagram: instagram.trim().replace(/^@/, '') || null,
      });
      await submitIdVerification(idPath, selfiePath);
      await refreshProfile();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ThemedText type="subtitle">Verify it&apos;s you</ThemedText>
      <ThemedText themeColor="textSecondary">
        Everyone on PackTrack is a verified student. Your ID is only seen by our review team — never by other students.
      </ThemedText>

      {profile?.verification_status === 'rejected' && (
        <Card>
          <ThemedText type="smallBold" themeColor="danger">
            We couldn&apos;t verify your last submission. Please retake clear photos of your ID and face.
          </ThemedText>
        </Card>
      )}

      <Card>
        <ThemedText type="smallBold">1. Your profile</ThemedText>
        <View style={styles.avatarRow}>
          <Avatar path={profile?.avatar_path} localUri={avatar?.uri} name={firstName} size={72} />
          <View style={styles.flex}>
            <ThemedText type="small" themeColor="textSecondary">
              Your photo is only shown to people in a walking group you both agreed to join.
            </ThemedText>
          </View>
        </View>
        <View style={styles.buttonRow}>
          <Button compact variant="secondary" title="Take photo" onPress={choose(setAvatar, { source: 'camera', square: true, frontCamera: true })} />
          <Button compact variant="secondary" title="Choose photo" onPress={choose(setAvatar, { source: 'library', square: true })} />
        </View>
        <Field label="First name" value={firstName} onChangeText={setFirstName} autoComplete="given-name" />
      </Card>

      <Card>
        <ThemedText type="smallBold">2. Contact info (private)</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Only shared after a walk, and only with someone who also chooses to share with you.
        </ThemedText>
        <Field label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
        <Field label="Instagram (optional)" value={instagram} onChangeText={setInstagram} autoCapitalize="none" />
      </Card>

      <Card>
        <ThemedText type="smallBold">3. Government ID</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          A photo of the front of your driver&apos;s license, state ID or passport, plus a selfie so we can match them.
        </ThemedText>
        <View style={styles.idRow}>
          <IdThumb label="ID front" image={idFront} />
          <IdThumb label="Selfie" image={selfie} />
        </View>
        <View style={styles.buttonRow}>
          <Button compact variant="secondary" title="Photograph ID" onPress={choose(setIdFront, { source: 'camera' })} />
          <Button compact variant="secondary" title="Take selfie" onPress={choose(setSelfie, { source: 'camera', frontCamera: true })} />
        </View>
      </Card>

      <ErrorText message={error} />
      <Button title="Submit for verification" onPress={submit} loading={saving} disabled={!ready} />
      <Button title="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}

function IdThumb({ label, image }: { label: string; image: PickedImage | null }) {
  return (
    <View style={styles.flex}>
      {image ? (
        <Image source={{ uri: image.uri }} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]} />
      )}
      <ThemedText type="small" themeColor="textSecondary">
        {image ? `${label} ✓` : label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    gap: Spacing.one,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  idRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  thumb: {
    height: 96,
    borderRadius: Spacing.two,
  },
  thumbEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#999',
  },
});
