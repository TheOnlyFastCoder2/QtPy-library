import { createReactStore } from '@qtpy/state-management-react';
import React from 'react';
import {
  ExtractLabel,
  ExtractMessage,
  ExtractValue,
  FormConfigFromMap,
  FormDataFromMap,
  FormField,
  FormFieldClass,
  FormStateFromMap,
  FormValueMap,
  MessageDataType,
  PortalTarget,
} from './types';
import { runValidation, getPath, convertData, convertMessage, convertLabel } from './utils';

export default function createForm<TMap extends FormValueMap>(config: FormConfigFromMap<TMap>) {
  const formStore = createReactStore<FormStateFromMap<TMap>>({
    fields: Object.entries(config.fields).reduce(
      (acc, [key, field]) => ({
        ...acc,
        [key]: {
          label: field.label,
          validate:
            typeof field.validate === 'function' ? field.validate.bind(field) : field.validate, // Поддержка RegExp или функции
          message: field.message,
          value: field.initialValue ?? '',
          isError:
            field.initialValue !== undefined
              ? !runValidation(field.validate, field.initialValue, null)
              : false,
          dataLabel: null,
          dataMessage: null,
          dataValidate: null,
          isTouched: false,
          isFocused: false,
          isDirty: false,
          initialValue: field.initialValue ?? '',
        },
      }),
      {} as FormStateFromMap<TMap>['fields']
    ),
    isValid: false,
    isSubmitted: false,
  });

  const updateField = <K extends keyof TMap>(key: K, value: ExtractValue<TMap[K]>) => {
    formStore.batch(() => {
      const validator = formStore.get(($, t) => $.fields[t(key)].validate)!;
      const initialVal = formStore.get(($, t) => $.fields[t(key)].initialValue)!;
      const dataValidate = formStore.get(($, t) => $.fields[t(key)].dataValidate);
      const isError = value == null ? false : !runValidation(validator, value, dataValidate);

      formStore.update(($, t) => $.fields[t(key)].value, value);
      formStore.update(($, t) => $.fields[t(key)].isError, isError);
      formStore.update(($, t) => $.fields[t(key)].isDirty, value !== initialVal);
    });

    const allFields = formStore.get(($) => $.fields)!;
    const isFormValid = Object.keys(allFields).every((key) => {
      const field = allFields[key as K];
      if (field.value == null) return false;
      return !field.isError;
    });
    formStore.update(($) => $.isValid, isFormValid);
  };

  const validateAllFields = () => {
    const fields = formStore.get(($) => $.fields);
    let isFormValid = true;

    for (const key in fields) {
      formStore.update(
        ($, t) => $.fields[t(key)].isError,
        () => {
          const field = fields[key];
          const isValid = runValidation(field.validate, field.value, null);
          if (!isValid || field.value == null) {
            isFormValid = false;
          }
          return !isValid;
        }
      );
    }

    formStore.update(($) => $.isValid, isFormValid);
  };
  
  const handleSubmit = (event?: React.MouseEvent<HTMLElement, MouseEvent>) => {
    event?.preventDefault?.();
    const isSubmitted = formStore.get(($) => $.isSubmitted);
    validateAllFields();
    if (!isSubmitted) return formStore.update(($) => $.isSubmitted, true);
    formStore.reloadComponents(['onSubmit']);
  };

  const resetForm = <K extends keyof TMap>() => {
    formStore.batch(() => {
      (Object.keys(config.fields) as K[]).forEach((key) => {
        formStore.update(($, t) => $.fields[t(key)].value, '' as ExtractValue<TMap[K]>);
        formStore.update(($, t) => $.fields[t(key)].isError, false);
      });
      formStore.update(($) => $.isValid, false);
      formStore.update(($) => $.isSubmitted, false);
    });
  };

  const onSubmit = (callback: (formData: FormDataFromMap<TMap>) => void | Promise<void>) => {
    formStore.useEffect(
      [($) => $.isSubmitted, 'onSubmit'],
      ([isSubmitted]) => {
        const isValid = formStore.get(($) => $.isValid)!;
        if (!isValid) return;
        if (!isSubmitted) return;
        const fields = formStore.get(($) => $.fields)!;
        const formData = Object.entries(fields).reduce(
          (acc, [key, field]) => ({
            ...acc,
            [key]: field,
          }),
          {} as FormDataFromMap<TMap>
        );
        callback?.(formData);
      },
      { inInvalidation: true }
    );
  };

  const setPortalData = <K extends keyof TMap>(
    key: K,
    to: PortalTarget,
    data: MessageDataType<TMap[K]>
  ) => {
    const path = getPath(to);
    const d = convertData(data);
    formStore.update(($, t) => $.fields[t(key)][t(path)], d);
  };

  setPortalData.quiet = <K extends keyof TMap>(
    key: K,
    to: PortalTarget,
    data: MessageDataType<TMap[K]>
  ) => {
    const path = getPath(to);
    const d = convertData(data);
    formStore.update.quiet(($, t) => $.fields[t(key)][t(path)], d);
  };

  const getPortalData = <K extends keyof TMap>(
    key: K,
    from: PortalTarget
  ): MessageDataType<TMap[K]> => {
    const path = getPath(from);
    return formStore.get(($, t) => $.fields[t(key)][t(path)]) as any as MessageDataType<TMap[K]>;
  };

  const addField = <K extends keyof TMap>(
    key: K,
    config: FormFieldClass<ExtractValue<TMap[K]>, ExtractLabel<TMap[K]>, ExtractMessage<TMap[K]>>
  ) => {
    const initialValue = config.initialValue ?? ('' as ExtractValue<TMap[K]>); // Устанавливаем значение по умолчанию
    formStore.update(
      ($) => $.fields,
      (fields) => {
        fields[key] = {
          label: config.label,
          message: config.message,
          validate:
            typeof config.validate === 'function' ? config.validate.bind(config) : config.validate, // Поддержка RegExp или функции
          value: initialValue,
          isError:
            initialValue !== undefined
              ? !runValidation(config.validate, initialValue, null)
              : false,
          dataLabel: null,
          dataMessage: null,
          dataValidate: null,
          isTouched: false,
          isDirty: false,
          initialValue: initialValue,
        };
        return fields;
      }
    );
  };

  const getField = <K extends keyof TMap>(key: K) => {
    return formStore.get(($, t) => $.fields[t(key)]);
  };

  const watchField = <K extends keyof TMap>(
    key: K,
    callback: (
      value: FormField<ExtractValue<TMap[K]>, ExtractMessage<TMap[K]>, ExtractLabel<TMap[K]>>
    ) => void,
    type: 'react' | 'native' = 'native'
  ) => {
    type s = FormField<ExtractValue<TMap[K]>, ExtractMessage<TMap[K]>, ExtractLabel<TMap[K]>>;
    switch (type) {
      case 'react':
        return formStore.useEffect(
          [
            ($, t) => $.fields[t(key)].value,
            ($, t) => $.fields[t(key)].isError,
            ($, t) => $.fields[t(key)].message,
            ($, t) => $.fields[t(key)].label,
            ($, t) => $.fields[t(key)].isTouched,
            ($, t) => $.fields[t(key)].isDirty,
          ],
          ([value, isError, message, label, isTouched, isDirty]) => {
            callback({ value, isError, message, label, isTouched, isDirty } as s);
          }
        );
      case 'native':
        return formStore.subscribe(
          () =>
            callback({
              value: formStore.get(($, t) => $.fields[t(key)].value),
              isError: formStore.get(($, t) => $.fields[t(key)].isError),
              message: formStore.get(($, t) => $.fields[t(key)].message),
              label: formStore.get(($, t) => $.fields[t(key)].label),
              isTouched: formStore.get(($, t) => $.fields[t(key)].isTouched),
              isDirty: formStore.get(($, t) => $.fields[t(key)].isDirty),
            } as s),
          [
            ($, t) => $.fields[t(key)].value,
            ($, t) => $.fields[t(key)].isError,
            ($, t) => $.fields[t(key)].message,
            ($, t) => $.fields[t(key)].label,
            ($, t) => $.fields[t(key)].isTouched,
            ($, t) => $.fields[t(key)].isDirty,
          ]
        );
    }
  };

  const onBlur = <K extends keyof TMap>(key: K) => {
    formStore.update(($, t) => $.fields[t(key)].isTouched, true);
    formStore.asyncUpdate.quiet(
      ($, t) => $.fields[t(key)].isTouched,
      async (_, signal) => {
        await new Promise((res, rej) => {
          const timeout = setTimeout(res, config.delayOnBlur ?? 1000);
          signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            rej(new DOMException('Aborted', 'AbortError'));
          });
        });
        return false;
      },
      { abortPrevious: true }
    );
  };

  const useField = <
    R extends keyof TMap = never,
    K extends Exclude<keyof TMap, R> = Exclude<keyof TMap, R>
  >(
    key: K
  ) => {
    type Value = ExtractValue<TMap[K]>;
    type Message = ExtractMessage<TMap[K]>;
    type Label = ExtractLabel<TMap[K]>;

    const [value, isError, message, label, dataLabel, dataMessage, isTouched, isDirty] =
      formStore.useStore([
        ($, t) => $.fields[t(key)].value as Value,
        ($, t) => $.fields[t(key)].isError,
        ($, t) => $.fields[t(key)].message as Message,
        ($, t) => $.fields[t(key)].label as Label,
        ($, t) => $.fields[t(key)].dataLabel,
        ($, t) => $.fields[t(key)].dataMessage,
        ($, t) => $.fields[t(key)].isTouched,
        ($, t) => $.fields[t(key)].isDirty,
      ]);

    const onChange = (e: React.ChangeEvent<HTMLInputElement>) =>
      updateField(key, e.target.value as Value);

    onChange.setValue = (v: Value) => updateField(key, v);

    return {
      value,
      isError,
      onChange,
      isTouched,
      isDirty,
      onBlur: () => onBlur(key),
      message: convertMessage<K, TMap>(message, value, dataMessage),
      label: convertLabel<K, TMap>(label, value, dataLabel),
    };
  };

  const useFormStatus = () => {
    const [isSubmitted, isValid] = formStore.useStore([($) => $.isSubmitted, ($) => $.isValid]);
    return { isValid, isSubmitted };
  };

  return {
    onSubmit,
    handleSubmit,
    resetForm,
    watchField,
    useField,
    useFormStatus,
    setPortalData,
    getPortalData,
    addField,
    getField,
  };
}
