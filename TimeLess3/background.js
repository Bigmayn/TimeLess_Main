// Store alarms for each configuration
let configAlarms = new Map();

chrome.runtime.onInstalled.addListener(() => {
  initializeAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  initializeAlarms();
});

function initializeAlarms() {
  chrome.alarms.clearAll(() => {
    chrome.storage.sync.get(null, (items) => {
      Object.entries(items).forEach(([key, config]) => {
        if (key.startsWith('config') && config.active) {
          const configId = key.replace('config', '');
          updateAlarm(config, configId);
        }
      });
    });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateAlarm') {
    updateAlarm(request.config, request.configId);
    sendResponse({success: true});
  } else if (request.action === 'stopAlarm') {
    stopAlarm(request.configId);
    sendResponse({success: true});
  } else if (request.action === 'test') {
    openLink(request.link);
    sendResponse({success: true});
  }
  return true;
});

function updateAlarm(config, configId) {
  const alarmName = `timelessAlarm${configId}`;
  
  // Validate and adjust interval
  const { interval, intervalUnit } = config;
  let minutes = intervalUnit === 'hours' ? interval * 60 : parseInt(interval);
  
  // Ensure minimum 1-minute interval
  minutes = Math.max(1, Math.floor(minutes));
  
  console.log(`Setting up alarm with ${minutes} minute interval`);

  chrome.alarms.clear(alarmName, () => {
    if (chrome.runtime.lastError) {
      console.error('Error clearing alarm:', chrome.runtime.lastError);
      return;
    }

    // Create alarm with minimal delay for first trigger
    chrome.alarms.create(alarmName, {
      delayInMinutes: 0.017, // Approximately 1 second delay
      periodInMinutes: minutes
    });
    
    // Store config with validated interval
    configAlarms.set(alarmName, {
      ...config,
      validatedInterval: minutes
    });

    // Check immediately in case we're in the time window
    checkTimeAndOpenLink(configAlarms.get(alarmName));
  });
}

function stopAlarm(configId) {
  const alarmName = `timelessAlarm${configId}`;
  chrome.alarms.clear(alarmName, () => {
    if (chrome.runtime.lastError) {
      console.error('Error clearing alarm:', chrome.runtime.lastError);
      return;
    }
    configAlarms.delete(alarmName);
  });
}

// Main alarm listener with timestamp tracking
let lastProcessedTimes = new Map();

chrome.alarms.onAlarm.addListener((alarm) => {
  const now = Date.now();
  const config = configAlarms.get(alarm.name);
  
  if (config) {
    const lastProcessed = lastProcessedTimes.get(alarm.name) || 0;
    const minInterval = config.validatedInterval * 60 * 1000; // Convert to milliseconds
    
    console.log(`Alarm triggered: ${alarm.name}`, {
      timeSinceLastProcess: now - lastProcessed,
      minInterval: minInterval,
      currentTime: new Date().toISOString()
    });

    // Ensure minimum interval is respected
    if (now - lastProcessed >= minInterval) {
      console.log('Processing alarm trigger');
      lastProcessedTimes.set(alarm.name, now);
      checkTimeAndOpenLink(config);
    } else {
      console.log('Skipping trigger - too soon since last process');
    }
  }
});

function checkTimeAndOpenLink(config) {
  const { days, startTime, endTime, link } = config;
  const now = new Date();
  const currentDay = now.getDay().toString();
  
  // Get current time with seconds precision
  const currentMinutes = (now.getHours() * 60) + now.getMinutes() + (now.getSeconds() / 60);
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  let isInTimeWindow = false;
  if (endMinutes < startMinutes) {
    // Time window crosses midnight
    isInTimeWindow = currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  } else {
    isInTimeWindow = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  console.log('Time window check:', {
    currentTime: now.toISOString(),
    currentMinutes,
    startMinutes,
    endMinutes,
    isInTimeWindow,
    dayMatches: days.includes(currentDay)
  });

  if (days.includes(currentDay) && isInTimeWindow) {
    console.log('Opening link:', link);
    openLink(link);
  }
}

async function openLink(link) {
  if (!link) {
    console.error('No link provided');
    return;
  }

  const urlToOpen = link.startsWith('http://') || link.startsWith('https://') 
    ? link 
    : `https://${link}`;

  console.log(`Opening link: ${urlToOpen} at ${new Date().toISOString()}`);
  
  try {
    // Get all windows
    const windows = await chrome.windows.getAll();
    
    // Create the new tab
    const newTab = await chrome.tabs.create({ 
      url: urlToOpen,
      active: true  // Make it active immediately
    });

    // Force focus to the window containing the new tab
    await chrome.windows.update(newTab.windowId, { 
      focused: true,
      drawAttention: true
    });

    // Ensure the tab is activated within the window
    await chrome.tabs.update(newTab.id, { active: true });

    // If the window was minimized, restore it
    const window = await chrome.windows.get(newTab.windowId);
    if (window.state === 'minimized') {
      await chrome.windows.update(newTab.windowId, { state: 'normal' });
    }

    updateBadge();
    
    console.log('Tab created and focused:', newTab);
  } catch (error) {
    console.error('Error handling tab creation/focus:', error);
  }
}

function updateBadge() {
  chrome.action.setBadgeText({ text: "!" });
  chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
}

chrome.action.onClicked.addListener(() => {
  chrome.action.setBadgeText({ text: "" });
});

// More frequent alarm verification for 1-minute intervals
chrome.alarms.create('verifyAlarms', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'verifyAlarms') {
    configAlarms.forEach((config, alarmName) => {
      chrome.alarms.get(alarmName, (alarm) => {
        if (!alarm && config.active) {
          const configId = alarmName.replace('timelessAlarm', '');
          updateAlarm(config, configId);
        }
      });
    });
  }
});