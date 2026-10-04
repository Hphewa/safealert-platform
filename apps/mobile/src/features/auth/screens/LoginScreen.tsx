import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { ApiClientError } from '../../../services/api/client';
import { useAuth } from '../hooks/useAuth';
import { routeForRole } from '../utils/roleRoutes';
import { authStyles } from './AuthStyles';
import { BrandLogo } from '../components/BrandLogo';

export function LoginScreen() {
  const router = useRouter();
  const { login, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);

    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);

    try {
      await login({ email, password });
      const destinationRole = user?.role;
      router.replace(destinationRole ? routeForRole(destinationRole) : '/');
    } catch (caughtError) {
      const message =
        caughtError instanceof ApiClientError || caughtError instanceof Error
          ? caughtError.message
          : 'Unable to sign in right now.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={authStyles.screen}>
      <View style={authStyles.brandPanel}>
        <BrandLogo size={48} />
        <Text style={authStyles.brandName}>SafeAlert</Text>
        <Text style={authStyles.brandTagline}>Know the risk. Act early.</Text>
      </View>
      <View>
        <Text style={authStyles.eyebrow}>WELCOME BACK</Text>
        <Text style={authStyles.title}>Sign in</Text>
        <Text style={authStyles.subtitle}>Stay connected to hazards, warnings, and help in your community.</Text>
      </View>

      <View style={authStyles.form}>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email"
          style={authStyles.input}
          value={email}
        />
        <TextInput
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          style={authStyles.input}
          value={password}
        />
        {error ? <Text style={authStyles.error}>{error}</Text> : null}
        <Pressable disabled={loading} onPress={submit} style={authStyles.button}>
          {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={authStyles.buttonText}>Login</Text>}
        </Pressable>
      </View>

      <Link href="/auth/register" asChild>
        <Pressable style={authStyles.secondaryButton}>
          <Text style={authStyles.secondaryButtonText}>Create resident account</Text>
        </Pressable>
      </Link>
    </View>
  );
}
