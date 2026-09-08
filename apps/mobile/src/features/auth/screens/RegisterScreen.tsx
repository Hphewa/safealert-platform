import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { ApiClientError } from '../../../services/api/client';
import { useAuth } from '../hooks/useAuth';
import { authStyles } from './AuthStyles';

export function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);

    if (!name.trim() || !email.trim() || !password) {
      setError('Name, email, and password are required.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      await register({ name, email, password });
      router.replace('/resident');
    } catch (caughtError) {
      const message =
        caughtError instanceof ApiClientError || caughtError instanceof Error
          ? caughtError.message
          : 'Unable to create account right now.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={authStyles.screen}>
      <View>
        <Text style={authStyles.title}>Create resident account</Text>
        <Text style={authStyles.subtitle}>Public registration creates Resident accounts only.</Text>
      </View>

      <View style={authStyles.form}>
        <TextInput onChangeText={setName} placeholder="Name" style={authStyles.input} value={name} />
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
        <TextInput
          onChangeText={setConfirmPassword}
          placeholder="Confirm password"
          secureTextEntry
          style={authStyles.input}
          value={confirmPassword}
        />
        <Text style={authStyles.helper}>Volunteer, Officer, and Responder accounts are provisioned separately.</Text>
        {error ? <Text style={authStyles.error}>{error}</Text> : null}
        <Pressable disabled={loading} onPress={submit} style={authStyles.button}>
          {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={authStyles.buttonText}>Register</Text>}
        </Pressable>
      </View>
    </View>
  );
}
