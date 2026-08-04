document.addEventListener('DOMContentLoaded', () => {
  const resetForm = document.getElementById('reset-form');
  
  // Mostrar/ocultar contraseña
  document.querySelectorAll('[data-toggle-password]').forEach(btn => {
    btn.addEventListener('click', () => {
      const inputId = btn.dataset.togglePassword;
      const input = document.getElementById(inputId);
      if (!input) return;
      const isText = input.type === 'text';
      input.type = isText ? 'password' : 'text';
      btn.textContent = isText ? '👁️' : '🙈';
    });
  });

  if (resetForm) {
    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const btn = resetForm.querySelector('[type="submit"]');
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token');
      
      const password = document.getElementById('new-password').value;
      const passwordConfirm = document.getElementById('new-password-confirm').value;
      
      const alertContainer = document.getElementById('reset-alert');
      const showAlert = (msg, type) => {
        const icons = { error: '❌', success: '✅' };
        alertContainer.innerHTML = `<div class="alert alert-${type}"><span class="alert-icon">${icons[type]}</span><span>${msg}</span></div>`;
      };

      alertContainer.innerHTML = '';

      if (!token) {
        showAlert('No se encontró un token válido. Por favor, solicita un nuevo enlace.', 'error');
        return;
      }

      if (password.length < 8) {
        showAlert('La contraseña debe tener al menos 8 caracteres.', 'error');
        return;
      }

      if (password !== passwordConfirm) {
        showAlert('Las contraseñas no coinciden.', 'error');
        return;
      }

      btn.classList.add('loading');
      btn.disabled = true;

      const { data, status } = await api.post('/auth/reset-password', {
        token: token,
        new_password: password
      });

      btn.classList.remove('loading');
      btn.disabled = false;

      if (status === 200) {
        showAlert(data.message, 'success');
        resetForm.reset();
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 3000);
      } else {
        showAlert(data?.error || 'Error al restablecer la contraseña.', 'error');
      }
    });
  }
});
