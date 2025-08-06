import { createReactStore } from '@qtpy/state-management-react';
import { useCallback, useMemo } from 'react';

export type FormField = {
  value: string;
  isError: boolean;
  regExp: RegExp;
  message: string;
  label: string;
};

export type FormState = {
  fields: Record<string, FormField>;
  isValid: boolean;
  isSubmitted: boolean;
};

export type FieldConfig = {
  label: string;
  regExp: RegExp;
  message: string;
  initialValue?: string;
};

export type FormData<T extends string> = Record<T, FormField>;

export type FormConfig<T extends string = string> = {
  fields: Record<T, FieldConfig>;
  onSubmit?: (formData: FormData<T>) => void | Promise<void>;
};

export interface UseForm<T extends string> {
  useFormStatus: () => { isValid: boolean; isSubmitted: boolean };
  handleSubmit: () => void;
  resetForm: () => void;
  watchField: (key: T, callback: (value: FormField) => void) => void;
  useField: (key: T) => {
    value: string;
    isError: boolean;
    message: string;
    label: string;
    onChange: {
      (e: React.ChangeEvent<HTMLInputElement>): void;
      setValue: (value: string) => void;
      getBool: (value: string) => boolean;
      toggleBool: (value: string) => string;
    };
  };
}

export default function useForm<T extends string>(config: FormConfig<T>): UseForm<T> {
  const formStore = useMemo(
    () =>
      createReactStore<FormState>({
        fields: Object.entries<FieldConfig>(config.fields).reduce(
          (acc, [key, { label, regExp, message, initialValue = '' }]) => ({
            ...acc,
            [key]: {
              label,
              regExp,
              message,
              value: initialValue,
              isError: initialValue ? !regExp.test(initialValue) : false,
            },
          }),
          {} as Record<string, FormField>
        ),
        isValid: false,
        isSubmitted: false,
      }),
    []
  );

  const updateField = useCallback(
    (key: string, value: string) => {
      formStore.batch(() => {
        const regExp = formStore.get(($, t) => $.fields[t(key)].regExp)!;
        const isError = value === '' ? false : !regExp.test(value);

        formStore.update(($, t) => $.fields[t(key)].value, value);
        formStore.update(($, t) => $.fields[t(key)].isError, isError);
      });

      const allFields = formStore.get(($) => $.fields)!;
      const isFormValid = Object.entries(allFields).every(([_, field]) => {
        if (field.value === '') return false;
        return !field.isError;
      });
      formStore.update(($) => $.isValid, isFormValid);
    },
    [formStore, config.fields]
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault?.();
      formStore.update(($) => $.isSubmitted, true);
      const isValid = formStore.get(($) => $.isValid)!;
      const fields = formStore.get(($) => $.fields)!;

      if (isValid) {
        const formData = Object.entries(fields).reduce(
          (acc, [key, field]) => ({
            ...acc,
            [key]: field,
          }),
          {} as FormData<T>
        );
        if (config.onSubmit) {
          await config.onSubmit(formData);
        }
      }
    },
    [formStore, config.onSubmit]
  );

  const resetForm = useCallback(() => {
    formStore.batch(() => {
      Object.keys(formStore.get(($) => $.fields)!).forEach((key) => {
        formStore.update(($, t) => $.fields[t(key)].value, '');
        formStore.update(($, t) => $.fields[t(key)].isError, false);
      });
      formStore.update(($) => $.isValid, false);
      formStore.update(($) => $.isSubmitted, false);
    });
  }, [formStore]);

  const watchField = useCallback(
    (key: T, callback: (value: FormField) => void) => {
      formStore.useEffect(
        [
          ($, t) => $.fields[t(key)].value,
          ($, t) => $.fields[t(key)].isError,
          ($, t) => $.fields[t(key)].message,
          ($, t) => $.fields[t(key)].label,
        ],
        ([value, isError, message, label]) => {
          callback({ value, isError, message, label } as FormField);
        }
      );
    },
    [formStore]
  );

  const useField = (key: T) => {
    const [value, isError, message, label] = formStore.useStore([
      ($, t) => $.fields[t(key)].value,
      ($, t) => $.fields[t(key)].isError,
      ($, t) => $.fields[t(key)].message,
      ($, t) => $.fields[t(key)].label,
    ]);

    const onChange = (e: React.ChangeEvent<HTMLInputElement>) => updateField(key, e.target.value);
    onChange.setValue = (value: string) => updateField(key, value);
    onChange.getBool = (value: string) => value.toLowerCase() === 'true';
    onChange.toggleBool = (value: string) => (value.toLowerCase() === 'true' ? 'false' : 'true');

    return {
      value,
      isError,
      message,
      label,
      onChange,
    };
  };

  const useFormStatus = useCallback(() => {
    const [isSubmitted, isValid] = formStore.useStore([($) => $.isSubmitted, ($) => $.isValid]);
    return { isValid, isSubmitted };
  }, []);

  return {
    handleSubmit: handleSubmit as unknown as UseForm<T>['handleSubmit'],
    resetForm,
    watchField,
    useField,
    useFormStatus,
  };
}