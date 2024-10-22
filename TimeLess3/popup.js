document.addEventListener('DOMContentLoaded', () => {
  const configPanels = document.getElementById('configPanels');
  const status = document.getElementById('status');
  const tabs = document.querySelectorAll('.tab');
  let activeConfigs = new Set();

  // Generate configuration panels
  for (let i = 1; i <= 5; i++) {
    const panel = createConfigPanel(i);
    configPanels.appendChild(panel);
  }

  // Initialize with first panel active
  document.querySelector('.config-panel').classList.add('active');

  // Tab switching logic
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Show corresponding panel
      document.querySelectorAll('.config-panel').forEach(panel => {
        panel.classList.remove('active');
        if (panel.dataset.tab === tabId) {
          panel.classList.add('active');
        }
      });
    });
  });

  function createConfigPanel(id) {
    const panel = document.createElement('div');
    panel.className = 'config-panel';
    panel.dataset.tab = id;

    const configStatus = document.createElement('div');
    configStatus.className = 'config-status';
    configStatus.innerHTML = `
      <div class="status-indicator" data-config="${id}"></div>
      <span>Configuration ${id}</span>
    `;
    
    const form = document.createElement('form');
    form.className = 'config-form';
    form.dataset.config = id;
    
    form.innerHTML = `
      <div class="field-container">
        <label>Select days:</label>
        <div id="daysContainer${id}">
          <label class="day-label">
            <input type="checkbox" class="day-checkbox" value="0" name="days">
            Sunday
          </label>
          <label class="day-label">
            <input type="checkbox" class="day-checkbox" value="1" name="days">
            Monday
          </label>
          <label class="day-label">
            <input type="checkbox" class="day-checkbox" value="2" name="days">
            Tuesday
          </label>
          <label class="day-label">
            <input type="checkbox" class="day-checkbox" value="3" name="days">
            Wednesday
          </label>
          <label class="day-label">
            <input type="checkbox" class="day-checkbox" value="4" name="days">
            Thursday
          </label>
          <label class="day-label">
            <input type="checkbox" class="day-checkbox" value="5" name="days">
            Friday
          </label>
          <label class="day-label">
            <input type="checkbox" class="day-checkbox" value="6" name="days">
            Saturday
          </label>
        </div>
      </div>

      <div class="field-container">
        <div class="input-group">
          <label for="startTime${id}">Start time:</label>
          <input type="time" id="startTime${id}" required name="startTime">
        </div>
      </div>

      <div class="field-container">
        <div class="input-group">
          <label for="endTime${id}">End time:</label>
          <input type="time" id="endTime${id}" required name="endTime">
        </div>
      </div>

      <div class="field-container">
        <div class="input-group">
          <label for="interval${id}">Interval:</label>
          <input type="number" id="interval${id}" min="1" required name="interval">
        </div>
        <div class="input-group">
          <select id="intervalUnit${id}" name="intervalUnit">
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
          </select>
        </div>
      </div>

      <div class="field-container">
        <div class="input-group">
          <label for="link${id}">Link:</label>
          <input type="text" id="link${id}" required name="link">
        </div>
      </div>

      <div class="button-group">
        <button type="button" class="test-btn">Test</button>
        <button type="submit" class="save-btn">Save & Start</button>
        <button type="button" class="stop-btn" disabled>Stop</button>
      </div>
    `;

    panel.appendChild(configStatus);
    panel.appendChild(form);

    // Load saved settings
    loadConfig(id, form);

    // Form submission
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      saveConfig(id, form);
    });

    // Test button
    form.querySelector('.test-btn').addEventListener('click', () => {
      const link = form.querySelector(`#link${id}`).value;
      testConfig(link);
    });

    // Stop button
    form.querySelector('.stop-btn').addEventListener('click', () => {
      stopConfig(id, form);
    });

    return panel;
  }

  function loadConfig(id, form) {
    chrome.storage.sync.get([`config${id}`], (result) => {
      const config = result[`config${id}`];
      if (config) {
        if (config.active) {
          activeConfigs.add(id);
          updateConfigStatus(id, true);
          form.querySelector('.stop-btn').disabled = false;
        }

        config.days?.forEach(day => {
          form.querySelector(`input[value="${day}"]`).checked = true;
        });
        form.querySelector(`#startTime${id}`).value = config.startTime || '';
        form.querySelector(`#endTime${id}`).value = config.endTime || '';
        form.querySelector(`#interval${id}`).value = config.interval || '';
        form.querySelector(`#intervalUnit${id}`).value = config.intervalUnit || 'minutes';
        form.querySelector(`#link${id}`).value = config.link || '';
      }
    });
  }

  function saveConfig(id, form) {
    const config = {
      days: Array.from(form.querySelectorAll('.day-checkbox:checked')).map(cb => cb.value),
      startTime: form.querySelector(`#startTime${id}`).value,
      endTime: form.querySelector(`#endTime${id}`).value,
      interval: form.querySelector(`#interval${id}`).value,
      intervalUnit: form.querySelector(`#intervalUnit${id}`).value,
      link: form.querySelector(`#link${id}`).value,
      active: true
    };

    chrome.storage.sync.set({ [`config${id}`]: config }, () => {
      if (chrome.runtime.lastError) {
        status.textContent = 'Error saving configuration. Please try again.';
        return;
      }
      
      activeConfigs.add(id);
      updateConfigStatus(id, true);
      form.querySelector('.stop-btn').disabled = false;
      status.textContent = `Configuration ${id} saved and activated!`;
      
      setTimeout(() => {
        status.textContent = '';
      }, 3000);

      chrome.runtime.sendMessage({ 
        action: 'updateAlarm',
        config: config,
        configId: id
      });
    });
  }

  function stopConfig(id, form) {
    chrome.storage.sync.get([`config${id}`], (result) => {
      const config = result[`config${id}`];
      if (config) {
        config.active = false;
        chrome.storage.sync.set({ [`config${id}`]: config }, () => {
          activeConfigs.delete(id);
          updateConfigStatus(id, false);
          form.querySelector('.stop-btn').disabled = true;
          status.textContent = `Configuration ${id} stopped!`;
          
          setTimeout(() => {
            status.textContent = '';
          }, 3000);

          chrome.runtime.sendMessage({ 
            action: 'stopAlarm',
            configId: id
          });
        });
      }
    });
  }

  function testConfig(link) {
    chrome.runtime.sendMessage({ 
      action: 'test',
      link: link
    }, (response) => {
      if (chrome.runtime.lastError) {
        status.textContent = 'Error testing configuration. Please try again.';
      }
    });
  }

  function updateConfigStatus(id, active) {
    const indicator = document.querySelector(`.status-indicator[data-config="${id}"]`);
    if (active) {
      indicator.classList.add('active');
    } else {
      indicator.classList.remove('active');
    }
  }
});