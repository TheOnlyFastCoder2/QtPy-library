import { ReactStore } from '@qtpy/state-management-react/types';
import {
  ExtractLabel,
  ExtractMessage,
  ExtractValue,
  FormStateFromMap,
  FormValueMap,
  MessageDataType,
  PortalTarget,
  Validator,
} from './types';

export function convertMessage<K extends keyof TMap, TMap extends FormValueMap>(
  message: ExtractMessage<TMap[K]>,
  value: ExtractValue<TMap[K]>,
  data: MessageDataType<TMap[K]>
): string | React.JSX.Element {
  if (typeof message === 'function') {
    return message(value, data);
  }
  return message;
}
export function convertLabel<K extends keyof TMap, TMap extends FormValueMap>(
  label: ExtractLabel<TMap[K]>,
  value: ExtractValue<TMap[K]>,
  data: MessageDataType<TMap[K]>
): string | React.JSX.Element {
  if (typeof label === 'function') {
    return label(value, data);
  }
  return label;
}

export function runValidation<T, D>(validator: Validator<T, D>, value: T, data: D): boolean {
  if (typeof validator === 'function') return validator(value, data);
  return validator.test(String(value));
}

export const getPath = (v: PortalTarget) => {
  switch (v) {
    case 'message':
      return 'dataMessage';
    case 'label':
      return 'dataLabel';
    case 'validate':
      return 'dataValidate';
  }
};

export const convertData = (d: any) => (d === undefined ? null : d);

export const handleFieldInteraction = <
  TMap extends FormValueMap,
  K extends keyof TMap,
>(
  key: K,
  propsKey: 'isTouched'|'isFocused',
  formStore: ReactStore<FormStateFromMap<TMap>, 0>,
  delayOn: number = 1000
) => {
  formStore.update(($, t) => $.fields[t(key)][propsKey], true);
  formStore.asyncUpdate.quiet(
    ($, t) => $.fields[t(key)].isTouched,
    async (_, signal) => {
      await new Promise((res, rej) => {
        const timeout = setTimeout(res, delayOn);
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
