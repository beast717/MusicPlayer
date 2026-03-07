import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme } from '../theme';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';

interface TextInputModalProps {
  visible: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  submitLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function TextInputModal({
  visible,
  title,
  message,
  placeholder,
  defaultValue = '',
  submitLabel = 'OK',
  onSubmit,
  onCancel,
}: TextInputModalProps) {
  const { theme } = useTheme();
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (visible) {
      setValue(defaultValue);
    }
  }, [visible, defaultValue]);

  const handleSubmit = () => {
    if (value.trim()) {
      onSubmit(value.trim());
      setValue('');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View
          style={[
            styles.container,
            {
              backgroundColor: theme.surfaceElevated,
              borderRadius: borderRadius.xl,
            },
          ]}
        >
          <Text
            style={[typography.title3, { color: theme.text, textAlign: 'center' }]}
          >
            {title}
          </Text>

          {message && (
            <Text
              style={[
                typography.footnote,
                {
                  color: theme.textSecondary,
                  textAlign: 'center',
                  marginTop: spacing.sm,
                },
              ]}
            >
              {message}
            </Text>
          )}

          <TextInput
            style={[
              styles.input,
              typography.body,
              {
                color: theme.text,
                backgroundColor: theme.searchBar,
                borderRadius: borderRadius.md,
              },
            ]}
            value={value}
            onChangeText={setValue}
            onSubmitEditing={handleSubmit}
            placeholder={placeholder}
            placeholderTextColor={theme.textTertiary}
            autoFocus
            selectTextOnFocus
          />

          <View style={[styles.buttons, { borderTopColor: theme.border }]}>
            <TouchableOpacity
              style={styles.button}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text
                style={[
                  typography.body,
                  { color: theme.textSecondary, fontWeight: '500' },
                ]}
              >
                Cancel
              </Text>
            </TouchableOpacity>

            <View style={[styles.separator, { backgroundColor: theme.border }]} />

            <TouchableOpacity
              style={styles.button}
              onPress={handleSubmit}
              accessibilityRole="button"
              accessibilityLabel={submitLabel}
            >
              <Text
                style={[
                  typography.body,
                  { color: theme.primary, fontWeight: '600' },
                ]}
              >
                {submitLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: spacing.xxl,
  },
  container: {
    width: '100%',
    maxWidth: 320,
    padding: spacing.xl,
    paddingBottom: 0,
  },
  input: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  buttons: {
    flexDirection: 'row',
    marginTop: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginHorizontal: -spacing.xl,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  separator: {
    width: StyleSheet.hairlineWidth,
  },
});
