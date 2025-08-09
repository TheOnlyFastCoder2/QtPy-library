import {
  ExtractLabel,
  ExtractMessage,
  ExtractValue,
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
  console.log(value, validator)
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

