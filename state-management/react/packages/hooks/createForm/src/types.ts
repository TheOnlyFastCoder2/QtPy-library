
export type ExtractValue<T> = T extends { type: infer V } ? V : never;
export type ExtractLabel<T> = T extends { label: infer L } ? L : never;
export type ExtractMessage<T> = T extends { message: infer M } ? M : never;
export type MessageDataType<T> = ExtractMessage<T> extends (value: any, data: infer D) => any
  ? D
  : null;

export type Validator<T, D = any> = RegExp | ((value: T, data: D) => boolean);


export type FormField<TValue, TMessage, TLabel> = {
  value: TValue;
  isError: boolean;
  validate: Validator<TValue>;
  message: TMessage;
  label: TLabel;
  dataMessage: null | any;
  dataLabel: null | any;
  dataValidate: null | any;
  isTouched: boolean;
  isFocused: boolean;
  isDirty: boolean;
  initialValue: TValue;
};

export type ValueMap<T extends string> = Record<T, any>;

export type FormState<
  T extends string = any,
  TValueMap extends ValueMap<T> = ValueMap<T>,
  TMessage = any | ((value: any, data: any) => any),
  TLabel = any | ((value: any, data: any) => any)
> = {
  fields: Record<T, FormField<TValueMap[T], TMessage, TLabel>>;
  isValid: boolean;
  isSubmitted: boolean;
};

export type FieldConfig<TValue, TMessage, TLabel> = {
  label: TLabel;
  validate: Validator<TValue>;
  message: TMessage;
  initialValue?: TValue;
};

export type FormValueMap = {
  [key: string]: {
    type: any;
    label: any | ((value: any, data: any) => any);
    message: any | ((value: any, data: any) => any);
  };
};

export interface FormFieldClass<TValue = any, TLabel = any, TMessage = any> {
  type: TValue;
  label: TLabel;
  message: TMessage;
  validate: Validator<TValue>;
  initialValue?: TValue;
}

export type FieldConfigFromMap<TMap extends FormValueMap> = {
  [K in keyof TMap]: FieldConfig<
    ExtractValue<TMap[K]>,
    ExtractMessage<TMap[K]>,
    ExtractLabel<TMap[K]>
  >;
};

export type FormConfigFromMap<TMap extends FormValueMap> = {
  fields: FieldConfigFromMap<TMap>;
  delayOnBlur?: number;
  delayOnFocus?: number;
};

export type FormStateFromMap<TMap extends FormValueMap> = {
  fields: {
    [K in keyof TMap]: FormField<
      ExtractValue<TMap[K]>,
      ExtractMessage<TMap[K]>,
      ExtractLabel<TMap[K]>
    >;
  };
  isValid: boolean;
  isSubmitted: boolean;
};

export type FormDataFromMap<TMap extends FormValueMap> = {
  [K in keyof TMap]: FormField<
    ExtractValue<TMap[K]>,
    ExtractMessage<TMap[K]>,
    ExtractLabel<TMap[K]>
  >;
};

export type KeyPattern<TPrefix extends string> = `${TPrefix}_${number}`;

export type IsExclude<T extends PropertyKey, R = never> = R extends never ? T : Exclude<T, R>;
export type PortalTarget = 'message' | 'label' | 'validate';

