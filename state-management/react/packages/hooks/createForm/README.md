# Документация по использованию библиотеки `createForm`

Библиотека `createForm` предоставляет мощный и минималистичный инструмент для создания форм в React-приложениях с TypeScript. Она поддерживает конфигурацию полей через классы или объекты, позволяет задавать метки и сообщения об ошибках как примитивные данные, JSX-компоненты или динамические функции. Все примеры используют переиспользуемые компоненты `Input` и `CheckBox` для минимизации кода. В документации рассмотрены все методы библиотеки: `onSubmit`, `handleSubmit`, `resetForm`, `watchField`, `useField`, `useFormStatus`, `setPortalData`, `getPortalData`, `addField`, `getField`, `watchField`.

## Содержание

1. [Основные возможности библиотеки](#основные-возможности-библиотеки)
2. [Реализация компонентов](#компоненты)  
   2.1. [Компонент Input](#компонент-input)  
   2.2. [Компонент CheckBox](#компонент-consentcheckbox)
3. [Примеры](#примеры-использования-методов)  
   3.1 [Использование классов](#1-форма-с-классами-и-чекбоксом-usefield-useformstatus-handlesubmit-onsubmit)  
   3.2 [Сброс формы с `resetForm`](#2-сброс-формы-с-resetform)  
   3.3 [Наблюдение за полем с `watchField`](#3-наблюдение-за-полем-с-watchfield)  
   3.4 [Динамическое добавление полей с `addField`](#4-динамическое-добавление-полей-с-addfield)  
   3.5 [Получение данных поля с `getField`](#5-получение-данных-поля-с-getfield)  
   3.6 [Динамические данные с `setPortalData` и `getPortalData`](#6-динамические-данные-с-setportaldata-и-getportaldata)  
   3.7 [JSX для меток и сообщений](#7-jsx-для-меток-и-сообщений)  
   3.8 [Обработка `onBlur`](#обработка-onblur-и-onfocus) 

4. [Пример с асинхронной валидацией и debounced](#пример-с-асинхронной-валидацией-и-debounced)  

5. [Заключение](#заключение)

## Основные возможности библиотеки

- **Конфигурация полей**: Поля задаются через классы или объекты. Поддерживаются строки, числа, булевы значения и JSX.
- **Валидация**: Регулярные выражения или функции для проверки. Поля отслеживают состояния `isTouched` и `isDirty`.
- **Динамические данные**: Метки и сообщения могут быть функциями, зависящими от значений или внешних данных.
- **Управление формой**: Полный набор методов для отправки, сброса, наблюдения и добавления полей.
- **Переиспользуемые компоненты**: Компоненты `Input` и `CheckBox` упрощают отображение текстовых полей и чекбоксов.

## Компоненты

### Компонент `Input`

Переиспользуемый компонент для текстовых и числовых полей:

```tsx
import form from './myForm.ts';

interface InputProps {
  name: Exclude<keyof FormValueMap, 'consent'>;
}

const Input = React.memo(({ name }: InputProps) => {
  const field = form.useField(name);
  const hasError = field.isError;
  const hasValue = Boolean(field.value);
  const errorClass = hasError ? 'error' : '';
  const valueClass = hasValue ? 'noEmpty' : '';
  const inputId = `input-${name}`;

  return (
    <div className={`Input ${errorClass} ${valueClass}`}>
      <div className="Input_wrapper">
        <label htmlFor={inputId} className="Input-label">
          {field.label}
        </label>
        <input 
          id={inputId} 
          required={false} 
          className="Input-self" 
          onChange={field.onChange} 
          value={field.value} />
      </div>
      {hasError && field.message && (
        <p className="Input-message">{field.message}</p>
      )}
    </div>
  );
});
```

- Принимает `name`, `form` и `type` (например, `text` или `number`).
- Отображает метку, поле ввода и сообщение об ошибке.

### Компонент `CheckBox`

Переиспользуемый компонент для чекбоксов:

```tsx
import { PropsWithChildren } from 'react';
import form from './myForm.ts';

interface Props extends PropsWithChildren {
  name: 'consent';
}

const CheckBox = React.memo(({ name , children }) => {
  const field = form.useField(name);
  const formStatus = form.useFormStatus();
  const clIsActive = field.value ? 'active' : '';
  const clIsError = field.isError ? 'error' : '';

  const handleToggle = () => {
    field.onChange.setValue(!field.value);
  };

  return (
    <div className={`checkbox ${clIsActive} ${clIsError}`}>
      <div
        className="checkbox-icon"
        onClick={handleToggle}
        children={✔}
      />
      <p
        className="checkbox-text"
        children={children}
      />
      {formStatus.isSubmitted && field.isError && (
        <p className="checkbox-error">{field.message}</p>
      )}
    </div>
  );
});
```

- Принимает `name`, `form` и `children` (текст для чекбокса).
- Отображает чекбокс с иконкой и сообщением об ошибке после отправки формы.

## Примеры использования методов

### 1. Форма с классами и чекбоксом (`useField`, `useFormStatus`, `handleSubmit`, `onSubmit`)

Пример формы с текстовым полем и чекбоксом:

```tsx
import React from 'react';
import createForm from '@qtpy/react-stm-form';
import { FormFieldClass } from '@qtpy/react-stm-form/types';

class Username implements FormFieldClass {
  type: string;
  message = 'Некорректные символы';
  validate = /[a-zA-Zа-яА-Я]+$/;
  label(value: string) {
    return `Имя (${value.length} символов)`;
  }
}

class Consent implements FormFieldClass {
  type: boolean;
  message = 'Требуется согласие';
  label = 'Согласие';
  validate = /^true$/;
  initialValue = false;
}

type FormValueMap = {
  username: Username;
  consent: Consent;
};

const form = createForm<FormValueMap>({
  fields: {
    username: new Username(),
    consent: new Consent(),
  },
  delayOnBlur: 100,
});

const App = () => {
  const formStatus = form.useFormStatus();
  form.onSubmit((formData) => {
    console.log('Форма отправлена:', formData);
  });

  return (
    <div className="p-4">
      <Input name="username" />
      <CheckBox name="consent">
        Согласен с условиями
      </CheckBox>
      <button onClick={form.handleSubmit} disabled={!formStatus.isValid}>
        Отправить
      </button>
      {formStatus.isSubmitted && <p>Форма отправлена</p>}
    </div>
  );
};
```

- `useField`: Получает данные поля.
- `useFormStatus`: Возвращает `isValid` и `isSubmitted`.
- `handleSubmit`: Запускает отправку формы.
- `onSubmit`: Обрабатывает данные формы при отправке.

### 2. Сброс формы с `resetForm`

Сброс полей к начальным значениям:

```tsx
import createForm from '@qtpy/react-stm-form';

type FormValueMap = {
  email: { type: string; label: string; message: string };
};

const form = createForm<FormValueMap>({
  fields: {
    email: {
      label: 'Электронная почта',
      message: 'Некорректный email',
      validate: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      initialValue: 'test@example.com',
    },
  },
});

const App = () => {
  return (
    <div className="p-4">
      <Input name="email" />
      <button onClick={form.resetForm}>Сбросить</button>
    </div>
  );
};
```

- `resetForm`: Сбрасывает значения полей, ошибки и `isSubmitted`.

### 3. Наблюдение за полем с `watchField`

Отслеживание изменений поля:

```tsx
import React from 'react';
import createForm from '@qtpy/react-stm-form';

type FormValueMap = {
  username: { type: string; label: string; message: string };
};

const form = createForm<FormValueMap>({
  fields: {
    username: {
      label: 'Имя',
      message: 'Некорректное имя',
      validate: /[a-zA-Zа-яА-Я]+$/,
    },
  },
});

form.watchField('username',(field) => {
  console.log('Поле username:', field.value, 'Ошибка:', field.isError);
};

const App = () => {
  form.watchField('username', (field) => {
    console.log('Поле username:', field.value, 'Ошибка:', field.isError);
  }, 'react'); // можно отслеживать в react компоненте

  return (
    <div className="p-4">
      <Input name="username" />
    </div>
  );
};
```

- `watchField`: Вызывает callback при изменении состояния поля.

### 4. Динамическое добавление полей с `addField`

Добавление нового поля:

```tsx
import createForm from '@qtpy/react-stm-form';
import { KeyPattern } from '@qtpy/react-stm-form/types';

type FormValueMap = {
  task: { type: string; label: string; message: string };
  [key: `task_${number}`]: { type: string; label: string; message: string };
  // или
  [key: KeyPattern<'child'>]: { type: boolean; label: string; message: string };
  // чтобы проще исключать поля: Exclude<keyof FormValueMap, KeyPattern<'child'>>;
};

const form = createForm<FormValueMap>({
  fields: {
    task: {
      label: 'Задача',
      message: 'Поле не может быть пустым',
      validate: /.*$/,
    },
  },
});

const App = () => {
  form.addField('task_1', {
    label: 'Доп. задача',
    message: 'Поле не может быть пустым',
    validate: /.*$/,
  });
  console.log(form.getField('task_1'));

  return (
    <div className="p-4">
      <Input name="task" />
      <Input name="task_1" />
    </div>
  );
};
```

- `addField`: Добавляет поле с указанной конфигурацией.

### 5. Получение данных поля с `getField`

Получение текущего состояния поля:

```tsx
import createForm from '@qtpy/react-stm-form';

type FormValueMap = {
  username: { type: string; label: string; message: string };
};

const form = createForm<FormValueMap>({
  fields: {
    username: {
      label: 'Имя',
      message: 'Некорректное имя',
      validate: /[a-zA-Zа-яА-Я]+$/,
    },
  },
});

const App = () => {
  const field = form.getField('username');
  console.log('Состояние username:', field.value, field.isError);

  return (
    <div className="p-4">
      <Input name="username" />
    </div>
  );
};
```

- `getField`: Возвращает данные поля (значение, ошибка, метка).

### 6. Динамические данные с `setPortalData` и `getPortalData`

Передача и получение данных для сообщений и валидации:

```tsx
import createForm from '@qtpy/react-stm-form';

type FormValueMap = {
  phone: {
    type: string;
    label: string;
    message: (value: string, data: number) => string;
  };
};

const form = createForm<FormValueMap>({
  fields: {
    phone: {
      label: (value, data) => `У тебя хороший номер, прям ${data}: ${value} `,
      message: (value, data) => `Нужно ${data} цифр`,
      validate: (value, data) => value.length === Number(data),
    },
  },
});

const App = () => {
  form.setPortalData('phone', 'message', 10);
  form.setPortalData('phone', 'validate', '10');
  form.setPortalData('phone', 'label', '10/10');
  const messageData = form.getPortalData('phone', 'message');
  console.log('Данные для сообщения:', messageData);

  return (
    <div className="p-4">
      <Input name="phone" />
    </div>
  );
};
```

- `setPortalData`: Задаёт данные для сообщения или валидации.
- `getPortalData`: Получает установленные данные.

### 7. JSX для меток и сообщений

Кастомизация с помощью JSX:

```tsx
import createForm from '@qtpy/react-stm-form';

type FormValueMap = {
  username: { type: string; label: React.JSX.Element; message: React.JSX.Element };
};

const form = createForm<FormValueMap>({
  fields: {
    username: {
      label: <b style={{ color: 'blue' }}>Имя</b>,
      message: <span style={{ color: 'red' }}>Ошибка имени</span>,
      validate: /[a-zA-Zа-яА-Я]+$/,
    },
  },
});

const App = () => {
  return (
    <div className="p-4">
      <Input name="username" />
      <button onClick={form.handleSubmit}>Отправить</button>
    </div>
  );
};
```

- Метка и сообщение — JSX-компоненты.

### Обработка `onBlur` и `onFocus`

```tsx
import React from 'react';
import createForm from '@qtpy/react-stm-form';

type FormValueMap = {
  username: { type: string; label: string; message: string };
};

const form = createForm<FormValueMap>({
  fields: {
    username: {
      label: 'Имя',
      message: 'Некорректное имя',
      validate: /^[a-zA-Zа-яА-Я]+$/,
    },
  },
  delayOnBlur: 1000, // время когда поменяется обратно на false
});

form.watchField('username', (field) => {
  console.log('Поле username:', {
    value: field.value,
    isTouched: field.isTouched,
    isError: field.isError,
  });
}

const Input = ({ name }: { name: keyof FormValueMap }) => {
  const field = form.useField(name);

  return (
    <div>
      <label>
        {field.label} {field.isTouched && <span>(активно)</span>}
      </label>
      <input 
        onChange={field.onChange}
        onBlur={field.onBlur}
        value={field.value}
      />
      {field.isError && <p>{field.message}</p>}
    </div>
  );
};

const App = () => (
  <div className="p-4">
    <Input name="username" />
  </div>
);
```

### Пример с асинхронной валидацией и debounced

Простой пример формы с полем для номера телефона, где валидация выполняется асинхронно с debounced-задержкой.

```tsx
import createForm from '@qtpy/react-stm-form';
import { FormFieldClass, CreateFormReturn, DebouncedFn } from '@qtpy/react-stm-form/types';


class Phone implements FormFieldClass {
  type: string = 'string';
  label: string = 'Телефон';
  message: string = 'Проверяем...';
  prevValue: string = '';
  debounced!: DebouncedFn<[string, boolean]>;
  form?: CreateFormReturn<FormValueMap>;

  init = (form: CreateFormReturn<FormValueMap>) => {
    this.form = form;
    this.debounced = form.debounced(async (value: string, isValid:boolean) => {
      // Имитация асинхронного запроса (3 секунды)
      await new Promise((resolve) => setTimeout(resolve, 3000));
      this.prevValue = value;
      this.message = isValid ? 'Валидно!' : 'Только цифры!';
      console.log(`Проверено: ${value}`);
    }, 1000); // Задержка 1 секунда
  };

  validate(value: string) {
    const isValid = /^\d+$/.test(this.prevValue);
    this.debounced(value, isValid);
    return isValid;
  }
}

type FormValueMap = {
  phone: Phone;
};


const form = createForm<FormValueMap>({
  fields: { phone: new Phone() },
});

form.getField('phone').init(form) // передаем нашу форму

const App = () => (
  <div>
    <h1>Асинхронная форма</h1>
    <Input name="phone" />
    <button onClick={form.handleSubmit}>Отправить</button>
  </div>
);

export default App;
```

**Суть**:

- При потере фокуса (`onBlur`) поле `username` помечается как `isTouched: true`, отображается "(активно)".
- Через 1 секунду (`delayOnBlur`) `isTouched` сбрасывается в `false` (асинхронно через `asyncUpdate.quiet`), надпись исчезает.
- `abortPrevious: true` отменяет предыдущий таймер при повторном `onBlur`.

## Заключение

Библиотека `createForm` упрощает создание форм в React с TypeScript. Компоненты `Input` и `CheckBox` минимизируют код, а методы `onSubmit`, `handleSubmit`, `resetForm`, `watchField`, `useField`, `useFormStatus`, `setPortalData`, `getPortalData`, `addField`, `getField` обеспечивают гибкое управление формами.
