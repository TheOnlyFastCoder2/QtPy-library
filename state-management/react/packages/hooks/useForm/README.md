# Документация для хука `useForm`

## Содержание

- [Возвращаемые значения](#возвращаемые-значения)
- [Использование](#использование)
  - [Базовое использование](#базовое-использование)
  - [Использование метода `watchField`](#использование-метода-watchfield)
  - [Сброс формы](#сброс-формы)
  - [Получение статуса формы](#получение-статуса-формы)
  - [Использование метода `useField` для управления полями](#использование-метода-usefield-для-управления-полями)
- [Типы](#типы)
- [Примечания](#примечания)

## Возвращаемые значения

Хук `useForm` возвращает объект со следующими методами и свойствами:

| Метод/Свойство | Тип | Описание |
| --- | --- | --- |
| `useFormStatus` | `() => { isValid: boolean; isSubmitted: boolean }` | Возвращает текущее состояние формы (валидность и статус отправки). |
| `handleSubmit` | `() => void` | Обрабатывает отправку формы, вызывая `onSubmit`, если форма валидна. |
| `resetForm` | `() => void` | Сбрасывает все поля формы, их ошибки и статус формы. |
| `watchField` | `(key: T, callback: (value: FormField) => void) => void` | Подписывается на изменения указанного поля и вызывает callback. |
| `useField` | `(key: T) => { value: string; isError: boolean; message: string; label: string; onChange: {...} }` | Возвращает состояние и обработчик для поля формы. |

Свойство `onChange` в `useField` включает:
- `(e: React.ChangeEvent<HTMLInputElement>) => void` — обработчик изменения поля.
- `setValue: (value: string) => void` — устанавливает значение поля.
- `getBool: (value: string) => boolean` — преобразует строковое значение в булево.
- `toggleBool: (value: string) => string` — переключает булево значение ('true'/'false').

## Использование

### Базовое использование

Пример формы с валидацией имени, телефона и согласия:

```tsx
import useForm, { FieldConfig, UseForm } from '@qtpy/stm-use-form';
import React from 'react';


const formConfig: FieldConfig = {
  username: { label: 'Имя', regExp: /^[a-zA-Zа-яА-Я]+$/, message: 'Некорректные символы' },
  phone: { label: 'Телефон', regExp: /^\d+$/, message: 'Только цифры' },
  consent: { label: 'Согласие', regExp: /^true$/, message: 'Необходимо согласие', initialValue: 'false' },
};

type Names = keyof typeof formConfig;

function ContactForm() {
  const { useField, useFormStatus, handleSubmit } = useForm<Names>({
    fields: formConfig,
    onSubmit: (formData) => console.log('Форма отправлена:', formData),
  });

  return (
    <form>
      <Input name="username" useField={useField} />
      <Input name="phone" useField={useField} />
      <ConsentCheckbox name="consent" useField={useField} useFormStatus={useFormStatus}>
        Согласен с политикой конфиденциальности
      </ConsentCheckbox>
      <button type="button" onClick={handleSubmit}>Отправить</button>
    </form>
  );
}

interface Props extends React.PropsWithChildren {
  name: Names;
  useField: UseForm<Names>['useField'];
  useFormStatus: UseForm<Names>['useFormStatus'];
}

const ConsentCheckbox = React.memo(({ children, useField, useFormStatus, name }: Props) => {
  const { isError, value, message, label, onChange } = useField(name);
  const { isSubmitted } = useFormStatus!();

  const handleToggle = () => {
    const res = onChange.toggleBool(value);
    onChange.setValue(res);
  };

  return (
    <div>
      <label>
        <input type="checkbox" checked={onChange.getBool(value)} onChange={handleToggle} />
        {children}
      </label>
      {isSubmitted && isError && <p>{message}</p>}
    </div>
  );
});

interface InputProps {
  name: Names;
  useField: UseForm<Names>['useField'];
}

const Input = React.memo(({ useField, name }: InputProps) => {
  const { isError, value, message, label, onChange } = useField(name);

  return (
    <div>
      <label>
        {label}
        <input onChange={onChange} value={value} />
      </label>
      {isError && message && <p>{message}</p>}
    </div>
  );
});
```

### Использование метода `watchField`

Пример подписки на изменения поля `username`:

```tsx
import useForm, { FormConfig } from '@qtpy/stm-use-form';
import React from 'react';

type Names = 'username';
const formConfig: FormConfig<Names> = {
  fields: {
    username: { label: 'Имя', regExp: /^[a-zA-Zа-яА-Я]+$/, message: 'Некорректные символы' },
  },
  onSubmit: (formData) => console.log('Форма отправлена:', formData),
};

function WatchFieldExample() {
  const { useField, watchField } = useForm<Names>(formConfig);
  watchField('username', (field) => console.log('Username изменился:', field));

  const { value, isError, message, label, onChange } = useField('username');

  return (
    <div>
      <label>
        {label}
        <input onChange={onChange} value={value} />
      </label>
      {isError && message && <p>{message}</p>}
    </div>
  );
}
```

### Сброс формы

Пример использования метода `resetForm`:

```tsx
import useForm, { FormConfig } from '@qtpy/stm-use-form';
import React from 'react';

type Names = 'username';
const formConfig: FormConfig<Names> = {
  fields: {
    username: { label: 'Имя', regExp: /^[a-zA-Zа-яА-Я]+$/, message: 'Некорректные символы' },
  },
};

function ResetFormExample() {
  const { useField, resetForm, handleSubmit } = useForm<Names>(formConfig);
  const { value, isError, message, label, onChange } = useField('username');

  return (
    <form>
      <label>
        {label}
        <input onChange={onChange} value={value} />
      </label>
      {isError && message && <p>{message}</p>}
      <button type="button" onClick={handleSubmit}>Отправить</button>
      <button type="button" onClick={resetForm}>Сбросить</button>
    </form>
  );
}
```

### Получение статуса формы

Пример использования `useFormStatus` для отображения статуса формы:

```tsx
import useForm, { FormConfig } from '@qtpy/stm-use-form';
import React from 'react';

type Names = 'phone';
const formConfig: FormConfig<Names> = {
  fields: {
    phone: { label: 'Телефон', regExp: /^\d+$/, message: 'Только цифры' },
  },
  onSubmit: (formData) => console.log('Форма отправлена:', formData),
};

function FormStatusExample() {
  const { useField, useFormStatus, handleSubmit } = useForm<Names>(formConfig);
  const { isValid, isSubmitted } = useFormStatus();
  const { value, isError, message, label, onChange } = useField('phone');

  return (
    <form>
      <label>
        {label}
        <input onChange={onChange} value={value} />
      </label>
      {isError && message && <p>{message}</p>}
      <button type="button" onClick={handleSubmit} disabled={!isValid}>Отправить</button>
      <p>Форма валидна: {isValid ? 'Да' : 'Нет'}</p>
      <p>Форма отправлена: {isSubmitted ? 'Да' : 'Нет'}</p>
    </form>
  );
}
```

### Использование метода `useField` для управления полями

Пример управления полем `consent` с использованием чекбокса:

```tsx
import useForm, { FormConfig } from '@qtpy/stm-use-form';
import React, { PropsWithChildren } from 'react';

type Names = 'consent';
const formConfig: FormConfig<Names> = {
  fields: {
    consent: { label: 'Согласие', regExp: /^true$/, message: 'Необходимо согласие', initialValue: 'false' },
  },
  onSubmit: (formData) => console.log('Форма отправлена:', formData),
};

function ConsentForm() {
  const { useField, useFormStatus, handleSubmit } = useForm<Names>(formConfig);

  return (
    <form>
      <ConsentCheckbox name="consent" useField={useField} useFormStatus={useFormStatus}>
        Согласен с политикой конфиденциальности
      </ConsentCheckbox>
      <button type="button" onClick={handleSubmit}>Отправить</button>
    </form>
  );
}

interface Props extends PropsWithChildren {
  name: Names;
  useField: UseForm<Names>['useField'];
  useFormStatus: UseForm<Names>['useFormStatus'];
}

const ConsentCheckbox = React.memo(({ children, useField, useFormStatus, name }: Props) => {
  const { isError, value, message, label, onChange } = useField(name);
  const { isSubmitted } = useFormStatus();

  const handleToggle = () => {
    const res = onChange.toggleBool(value);
    onChange.setValue(res);
  };

  return (
    <div>
      <label>
        <input type="checkbox" checked={onChange.getBool(value)} onChange={handleToggle} />
        {children}
      </label>
      {isSubmitted && isError && <p>{message}</p>}
    </div>
  );
});
```

## Типы

Хук `useForm` использует следующие TypeScript-типы:

```typescript
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
```

## Примечания

- **Валидация**: Поля валидируются автоматически на основе регулярных выражений (`regExp`). Статус формы (`isValid`) обновляется при изменении полей. Поля с пустым значением (`''`) считаются невалидными, если не указано иное.
- **Чекбоксы**: Поля типа `consent` с булевым значением обрабатываются через `onChange.getBool` и `onChange.toggleBool`.
- **Оптимизация**: Компоненты `Input` и `ConsentCheckbox` обёрнуты в `React.memo` для предотвращения лишних рендеров.
- **Асинхронная отправка**: Метод `onSubmit` поддерживает асинхронные операции для работы с сервером.
- **Типизация**: Хук использует строгую типизацию через обобщённый тип `T` для безопасности работы с полями.
- **Ограничения**: Форма не отправляется, если `isValid` равно `false`. Все поля должны быть определены в конфигурации. Использование `<form>` с `onSubmit` не поддерживается из-за ограничений песочницы; вместо этого используется `handleSubmit` с кнопкой.