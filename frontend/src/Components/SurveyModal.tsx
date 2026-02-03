import { useForm } from 'react-hook-form';

type SurveyFormValues = {
  purpose: string;
  additions: string;
  contact: string;
};

type SurveyModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: SurveyFormValues) => Promise<void>;
};

export default function SurveyModal({ isOpen, onClose, onSubmit }: SurveyModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SurveyFormValues>({
    defaultValues: {
      purpose: '',
      additions: '',
      contact: '',
    },
  });

  if (!isOpen) return null;

  const submitHandler = async (values: SurveyFormValues) => {
    await onSubmit(values);
    reset();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-header">
          <h3>Небольшой опрос</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit(submitHandler)}>
          <label className="field">
            <span>Для чего вы использовали сервис?</span>
            <textarea
              rows={3}
              {...register('purpose', { required: 'Расскажите цель использования.' })}
              placeholder="Например: заполнение описаний товаров"
            />
            {errors.purpose && <span className="field-error">{errors.purpose.message}</span>}
          </label>

          <label className="field">
            <span>Что бы вы добавили?</span>
            <textarea
              rows={3}
              {...register('additions', { required: 'Поделитесь идеей улучшения.' })}
              placeholder="Например: пакетная обработка или шаблоны"
            />
            {errors.additions && <span className="field-error">{errors.additions.message}</span>}
          </label>

          <label className="field">
            <span>Оставите контакт (телефон/почта/телеграм)?</span>
            <input
              type="text"
              {...register('contact', { required: 'Нужен контакт для обратной связи.' })}
              placeholder="+7 900 000-00-00 или @username"
            />
            {errors.contact && <span className="field-error">{errors.contact.message}</span>}
          </label>

          <div className="modal-actions">
            <button className="ghost" type="button" onClick={onClose} disabled={isSubmitting}>
              Позже
            </button>
            <button className="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Отправка...' : 'Отправить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
