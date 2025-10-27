// playlist.js - Enhanced playlist l
import {
  auth,
  db,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  collection,
  addDoc,
  onAuthStateChanged,
  writeBatch,
  updateDoc,
  query,
  where, 
  increment
} from './firebase-config.js';

// Sanitization utility functions
const sanitize = {
  escapeHtml: (unsafe) => {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },

  sanitizeText: (text) => {
    if (typeof text !== 'string') return '';
    return text.trim();
  },

  sanitizeUrl: (url) => {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return '';
      return parsed.toString();
    } catch {
      return '';
    }
  }
};

const playlistState = {
  currentPlaylistId: null,
  currentVideoIndex: 0,
  playlistVideos: [],
  isPlaying: false,
  isShuffled: false,
  isRepeat: false,
  originalPlaylistOrder: [],
  player: null,
  playerReady: false,
  // Progress Bar State - ADD THESE TWO LINES
  progressInterval: null,
  isSeeking: false,
  channelInfo: {
    logo: '',
    name: '',
    id: '',
    favorites: [],
    userPlaylists: []
  },
  // Mini Player State
  miniPlayerVisible: false,
  isPlayerInView: true,
  // Drag & Drop State
  isDragging: false,
  dragStartIndex: -1,
  // Context Menu State
  contextMenuVideoIndex: -1
};
// Global video cache management
const videoCache = {
  async getVideoFromCache(videoId) {
    try {
      const videoRef = doc(db, 'sharedVideos', videoId);
      const videoDoc = await getDoc(videoRef);
      return videoDoc.exists() ? videoDoc.data() : null;
    } catch (error) {
      console.error('Error checking video cache:', error);
      return null;
    }
  },

  async addVideoToCache(videoData) {
    try {
      const videoRef = doc(db, 'sharedVideos', videoData.videoId);
      await setDoc(videoRef, {
        videoId: sanitize.sanitizeText(videoData.videoId),
        title: sanitize.escapeHtml(videoData.title),
        thumbnail: sanitize.sanitizeUrl(videoData.thumbnail),
        channel: sanitize.escapeHtml(videoData.channel),
        description: sanitize.escapeHtml(videoData.description) || '',
        duration: videoData.duration || 0,
        cachedAt: new Date().toISOString()
      });
      return true;
    } catch (error) {
      console.error('Error caching video:', error);
      return false;
    }
  }
};

// Custom Alert System
function showCustomAlert(message, type = 'info', duration = 3000) {
  const safeMessage = sanitize.escapeHtml(message);
  const alert = document.createElement('div');
  alert.className = `custom-alert ${type}`;
  alert.innerHTML = `
    <div class="alert-content">
      <i class="alert-icon ${getIconClass(type)}"></i>
      <span>${safeMessage}</span>
    </div>
  `;
  
  document.body.appendChild(alert);
  setTimeout(() => alert.classList.add('show'), 10);
  setTimeout(() => {
    alert.classList.remove('show');
    setTimeout(() => alert.remove(), 300);
  }, duration);
}

function getIconClass(type) {
  const icons = {
    'success': 'fas fa-check-circle',
    'error': 'fas fa-exclamation-circle',
    'warning': 'fas fa-exclamation-triangle',
    'info': 'fas fa-info-circle'
  };
  return icons[type] || icons['info'];
}

// SMART RECOVERY SYSTEM
function initializeSmartRecovery() {
  console.log('🔄 Initializing smart recovery system...');
  
  if (playlistState.kickstartTimer) {
    clearTimeout(playlistState.kickstartTimer);
  }
  if (playlistState.pageReloadTimer) {
    clearTimeout(playlistState.pageReloadTimer);
  }
  
  playlistState.kickstartTimer = setTimeout(() => {
    performKickstartRecovery();
  }, 7000);
  
  playlistState.pageReloadTimer = setTimeout(() => {
    performPageReload();
  }, 10000);
}

function performKickstartRecovery() {
  console.log('🎯 Performing kickstart recovery...');
  
  const videoCount = playlistState.playlistVideos.length;
  console.log(`📊 Current video count: ${videoCount}`);
  
  if (videoCount > 1) {
    console.log('🔄 Multiple videos detected - performing next/previous kickstart');
    performNextPreviousKickstart();
  } else if (videoCount === 1) {
    console.log('🔄 Single video detected - performing next button kickstart');
    performNextButtonKickstart();
  } else {
    console.log('❌ No videos detected - checking if reload is needed');
    checkAndReloadIfNeeded();
  }
}

function performNextPreviousKickstart() {
  if (playlistState.playlistVideos.length <= 1 || !playlistState.player) {
    console.log('❌ Cannot perform next/previous kickstart - insufficient videos or player not ready');
    return;
  }
  
  console.log('⚡ Performing next/previous kickstart sequence');
  
  const originalIndex = playlistState.currentVideoIndex;
  
  setTimeout(() => {
    if (playlistState.currentVideoIndex < playlistState.playlistVideos.length - 1) {
      console.log('⏭️ Quick next');
      playNextVideo();
      
      setTimeout(() => {
        console.log('⏮️ Quick previous');
        playPreviousVideo();
        
        showCustomAlert('Player kickstarted successfully!', 'success', 2000);
        console.log('✅ Kickstart sequence completed');
        
        if (playlistState.pageReloadTimer) {
          clearTimeout(playlistState.pageReloadTimer);
          playlistState.pageReloadTimer = null;
        }
      }, 500);
    }
  }, 300);
}

function performNextButtonKickstart() {
  if (playlistState.playlistVideos.length !== 1 || !playlistState.player) {
    console.log('❌ Cannot perform next button kickstart - not exactly one video or player not ready');
    return;
  }
  
  console.log('⚡ Performing next button kickstart');
  
  setTimeout(() => {
    console.log('⏭️ Simulating next button press');
    playNextVideo();
    
    showCustomAlert('Player activated!', 'success', 2000);
    console.log('✅ Next button kickstart completed');
    
    if (playlistState.pageReloadTimer) {
      clearTimeout(playlistState.pageReloadTimer);
      playlistState.pageReloadTimer = null;
    }
  }, 300);
}

function checkAndReloadIfNeeded() {
  const videoCount = playlistState.playlistVideos.length;
  const playerReady = playlistState.playerReady;
  const playlistId = playlistState.currentPlaylistId;
  
  console.log(`🔍 Recovery check - Videos: ${videoCount}, Player: ${playerReady}, Playlist: ${playlistId}`);
  
  if (videoCount === 0 && playlistId) {
    console.log('🔄 No videos loaded but playlist ID exists - performing page reload');
    performPageReload();
  } else if (videoCount === 0) {
    console.log('❌ No videos and no playlist ID - showing error');
    showCustomAlert('Failed to load playlist. Please check the URL.', 'error', 5000);
  }
}

function performPageReload() {
  if (playlistState.recoveryAttempted) {
    console.log('🛑 Recovery already attempted, not reloading again');
    return;
  }
  
  console.log('🔄 Performing silent page reload...');
  playlistState.recoveryAttempted = true;
  
  showCustomAlert('Reconnecting...', 'info', 2000);
  
  if (playlistState.kickstartTimer) {
    clearTimeout(playlistState.kickstartTimer);
    playlistState.kickstartTimer = null;
  }
  if (playlistState.pageReloadTimer) {
    clearTimeout(playlistState.pageReloadTimer);
    playlistState.pageReloadTimer = null;
  }
  
  const currentUrl = window.location.href;
  const reloadUrl = currentUrl + (currentUrl.includes('?') ? '&' : '?') + '_reload=' + Date.now();
  
  setTimeout(() => {
    console.log('🔁 Executing silent reload');
    window.location.replace(reloadUrl);
  }, 1500);
}

function cancelRecoveryTimers() {
  console.log('✅ Cancelling recovery timers - page loaded successfully');
  
  if (playlistState.kickstartTimer) {
    clearTimeout(playlistState.kickstartTimer);
    playlistState.kickstartTimer = null;
  }
  
  if (playlistState.pageReloadTimer) {
    clearTimeout(playlistState.pageReloadTimer);
    playlistState.pageReloadTimer = null;
  }
}

// IMPROVED DRAG & DROP SYSTEM WITH AUTO-SCROLL
// SMOOTH DRAG & DROP SYSTEM
let autoScrollInterval;
let scrollDirection = 0;
let isAutoScrolling = false;

function initDragAndDrop() {
  const playlistItems = document.getElementById('playlist-items');
  if (!playlistItems) return;

  playlistItems.addEventListener('dragover', handleDragOver);
  playlistItems.addEventListener('drop', handleDrop);
  
  console.log('🎯 Smooth drag & drop system initialized');
}

function handleDragStart(e, index) {
  playlistState.isDragging = true;
  playlistState.dragStartIndex = index;
  e.dataTransfer.setData('text/plain', index.toString());
  e.dataTransfer.effectAllowed = 'move';
  
  const item = e.target.closest('.playlist-item');
  if (item) {
    item.classList.add('dragging');
    
    // Create drag preview
    createDragPreview(item, index);
    
    // Start smooth auto-scroll
    startSmoothAutoScroll();
  }
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  
  // Update auto-scroll based on cursor position
  updateSmoothAutoScroll(e.clientY);
  
  // Handle visual feedback for drop targets
  handleDropVisualFeedback(e.clientY);
}

function handleDrop(e) {
  e.preventDefault();
  
  if (!playlistState.isDragging) return;
  
  const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
  const toIndex = calculateDropPosition(e.clientY);
  
  if (fromIndex !== toIndex && fromIndex !== -1 && toIndex !== -1) {
    moveVideoSmoothly(fromIndex, toIndex);
  }
  
  cleanupDrag();
}

function createDragPreview(originalItem, index) {
  // Remove any existing preview
  const existingPreview = document.querySelector('.drag-preview');
  if (existingPreview) {
    existingPreview.remove();
  }
  
  const preview = originalItem.cloneNode(true);
  preview.classList.add('drag-preview');
  preview.style.width = `${originalItem.offsetWidth}px`;
  preview.style.height = `${originalItem.offsetHeight}px`;
  
  document.body.appendChild(preview);
  
  // Position preview near cursor
  const updatePreviewPosition = (e) => {
    if (!preview.parentNode) return;
    
    const x = e.clientX - 50;
    const y = e.clientY - 20;
    
    preview.style.transform = `translate(${x}px, ${y}px) scale(1.05)`;
  };
  
  document.addEventListener('dragover', updatePreviewPosition);
  
  // Cleanup on drag end
  document.addEventListener('dragend', () => {
    if (preview.parentNode) {
      preview.remove();
    }
    document.removeEventListener('dragover', updatePreviewPosition);
  }, { once: true });
}

function calculateDropPosition(clientY) {
  const items = document.querySelectorAll('.playlist-item:not(.dragging)');
  const playlistContainer = document.getElementById('playlist-items');
  const containerRect = playlistContainer.getBoundingClientRect();
  
  // Adjust Y coordinate for container scroll
  const adjustedY = clientY - containerRect.top + playlistContainer.scrollTop;
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemRect = item.getBoundingClientRect();
    const itemTop = itemRect.top - containerRect.top + playlistContainer.scrollTop;
    const itemMiddle = itemTop + itemRect.height / 2;
    
    if (adjustedY < itemMiddle) {
      return parseInt(item.getAttribute('data-index'));
    }
  }
  
  // If dropped after all items
  return items.length;
}

function handleDropVisualFeedback(clientY) {
  // Remove all existing drop indicators
  document.querySelectorAll('.drop-indicator').forEach(indicator => {
    indicator.remove();
  });
  
  // Remove highlight from all items
  document.querySelectorAll('.playlist-item').forEach(item => {
    item.classList.remove('drag-over', 'drop-above', 'drop-below');
  });
  
  const items = document.querySelectorAll('.playlist-item:not(.dragging)');
  const playlistContainer = document.getElementById('playlist-items');
  const containerRect = playlistContainer.getBoundingClientRect();
  const adjustedY = clientY - containerRect.top + playlistContainer.scrollTop;
  
  let dropPosition = -1;
  let dropAbove = false;
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemRect = item.getBoundingClientRect();
    const itemTop = itemRect.top - containerRect.top + playlistContainer.scrollTop;
    const itemMiddle = itemTop + itemRect.height / 2;
    
    if (adjustedY < itemMiddle) {
      dropPosition = i;
      dropAbove = true;
      break;
    }
  }
  
  if (dropPosition === -1) {
    dropPosition = items.length;
  }
  
  // Visual feedback
  if (dropPosition < items.length) {
    const targetItem = items[dropPosition];
    if (dropAbove) {
      targetItem.classList.add('drop-above');
      createDropIndicator(targetItem, true);
    } else {
      targetItem.classList.add('drop-below');
      createDropIndicator(targetItem, false);
    }
  } else if (items.length > 0) {
    // Drop at the end
    const lastItem = items[items.length - 1];
    lastItem.classList.add('drop-below');
    createDropIndicator(lastItem, false);
  }
}

function createDropIndicator(targetItem, above) {
  const indicator = document.createElement('div');
  indicator.className = 'drop-indicator';
  
  if (above) {
    targetItem.parentNode.insertBefore(indicator, targetItem);
  } else {
    targetItem.parentNode.insertBefore(indicator, targetItem.nextSibling);
  }
}

// SMOOTH AUTO-SCROLL
function startSmoothAutoScroll() {
  if (autoScrollInterval) {
    clearInterval(autoScrollInterval);
  }
  
  autoScrollInterval = setInterval(() => {
    if (scrollDirection !== 0 && playlistState.isDragging) {
      const playlistContainer = document.getElementById('playlist-items');
      if (playlistContainer) {
        isAutoScrolling = true;
        
        // Smooth scroll with easing
        const scrollAmount = scrollDirection * 25;
        playlistContainer.scrollTop += scrollAmount;
        
        // Update visual feedback during scroll
        document.addEventListener('dragover', (e) => {
          handleDropVisualFeedback(e.clientY);
        }, { once: true });
      }
    } else {
      isAutoScrolling = false;
    }
  }, 16); // 60fps
}

function updateSmoothAutoScroll(clientY) {
  const playlistContainer = document.getElementById('playlist-items');
  if (!playlistContainer) return;
  
  const rect = playlistContainer.getBoundingClientRect();
  const scrollZoneHeight = 100; // Larger scroll zones for better UX
  
  // Calculate distance from edges
  const distanceFromTop = clientY - rect.top;
  const distanceFromBottom = rect.bottom - clientY;
  
  // Determine scroll direction and speed
  let newScrollDirection = 0;
  
  if (distanceFromTop < scrollZoneHeight) {
    // Near top - scroll up
    const intensity = 1 - (distanceFromTop / scrollZoneHeight);
    newScrollDirection = -1 * Math.max(0.3, intensity);
  } else if (distanceFromBottom < scrollZoneHeight) {
    // Near bottom - scroll down
    const intensity = 1 - (distanceFromBottom / scrollZoneHeight);
    newScrollDirection = 1 * Math.max(0.3, intensity);
  }
  
  scrollDirection = newScrollDirection;
}

function moveVideoSmoothly(fromIndex, toIndex) {
  const video = playlistState.playlistVideos[fromIndex];
  
  // Animate the move
  const items = document.querySelectorAll('.playlist-item');
  const fromItem = items[fromIndex];
  
  if (fromItem) {
    fromItem.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    fromItem.style.transform = 'scale(0.95)';
    fromItem.style.opacity = '0.7';
  }
  
  // Perform the move after a brief delay for smoothness
  setTimeout(() => {
    playlistState.playlistVideos.splice(fromIndex, 1);
    playlistState.playlistVideos.splice(toIndex, 0, video);
    
    // Update current video index if affected
    if (playlistState.currentVideoIndex === fromIndex) {
      playlistState.currentVideoIndex = toIndex;
    } else if (playlistState.currentVideoIndex > fromIndex && playlistState.currentVideoIndex <= toIndex) {
      playlistState.currentVideoIndex--;
    } else if (playlistState.currentVideoIndex < fromIndex && playlistState.currentVideoIndex >= toIndex) {
      playlistState.currentVideoIndex++;
    }
    
    renderPlaylistItems();
    highlightCurrentVideo();
    
    showCustomAlert('Playlist reordered', 'success', 1500);
  }, 150);
}

function cleanupDrag() {
  playlistState.isDragging = false;
  playlistState.dragStartIndex = -1;
  
  // Remove all visual feedback
  document.querySelectorAll('.playlist-item').forEach(item => {
    item.classList.remove('dragging', 'drag-over', 'drop-above', 'drop-below');
    item.style.transform = '';
    item.style.opacity = '';
    item.style.transition = '';
  });
  
  document.querySelectorAll('.drop-indicator').forEach(indicator => {
    indicator.remove();
  });
  
  document.querySelectorAll('.drag-preview').forEach(preview => {
    preview.remove();
  });
  
  // Stop auto-scroll
  stopAutoScroll();
}

function stopAutoScroll() {
  if (autoScrollInterval) {
    clearInterval(autoScrollInterval);
    autoScrollInterval = null;
  }
  scrollDirection = 0;
  isAutoScrolling = false;
}
// IMPROVED DRAG & DROP SYSTEM WITH AUTO-SCROLL

function moveVideo(fromIndex, toIndex) {
  const video = playlistState.playlistVideos[fromIndex];
  playlistState.playlistVideos.splice(fromIndex, 1);
  playlistState.playlistVideos.splice(toIndex, 0, video);
  
  // Update current video index if affected
  if (playlistState.currentVideoIndex === fromIndex) {
    playlistState.currentVideoIndex = toIndex;
  } else if (playlistState.currentVideoIndex > fromIndex && playlistState.currentVideoIndex <= toIndex) {
    playlistState.currentVideoIndex--;
  } else if (playlistState.currentVideoIndex < fromIndex && playlistState.currentVideoIndex >= toIndex) {
    playlistState.currentVideoIndex++;
  }
  
  renderPlaylistItems();
  highlightCurrentVideo();
  
  showCustomAlert('Playlist reordered', 'success', 2000);
}

// SIMPLIFIED CONTEXT MENU SYSTEM (REMOVED MOVE TO POSITION)
function initContextMenus() {
  // Close context menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.context-menu') && !e.target.closest('.menu-trigger')) {
      closeContextMenu();
    }
  });

  // Close on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeContextMenu();
    }
  });

  console.log('🎯 Simplified context menu system initialized');
}

function showContextMenu(e, index) {
  e.preventDefault();
  e.stopPropagation();
  
  closeContextMenu();
  
  playlistState.contextMenuVideoIndex = index;
  
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;
  
  menu.innerHTML = `
    <button class="context-menu-item" onclick="playNextFromMenu()">
      <i class="fas fa-play"></i>
      <span>Play Next</span>
    </button>
    <button class="context-menu-item" onclick="shareVideoFromMenu()">
      <i class="fas fa-share"></i>
      <span>Share Video</span>
    </button>
    <button class="context-menu-item delete" onclick="removeFromQueue()">
      <i class="fas fa-trash"></i>
      <span>Remove from Queue</span>
    </button>
  `;
  
  document.body.appendChild(menu);
  
  // Adjust position if menu goes off-screen
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${window.innerWidth - rect.width - 10}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${window.innerHeight - rect.height - 10}px`;
  }
}

function closeContextMenu() {
  const existingMenu = document.querySelector('.context-menu');
  if (existingMenu) {
    existingMenu.remove();
  }
  playlistState.contextMenuVideoIndex = -1;
}

function playNextFromMenu() {
  const index = playlistState.contextMenuVideoIndex;
  if (index === -1) return;
  
  // Move video to next position
  const video = playlistState.playlistVideos[index];
  playlistState.playlistVideos.splice(index, 1);
  const nextIndex = playlistState.currentVideoIndex + 1;
  playlistState.playlistVideos.splice(nextIndex, 0, video);
  
  // Update current video index if affected
  if (index < playlistState.currentVideoIndex) {
    playlistState.currentVideoIndex--;
  }
  
  renderPlaylistItems();
  highlightCurrentVideo();
  closeContextMenu();
  
  showCustomAlert('Video moved to play next', 'success');
}

function shareVideoFromMenu() {
  const index = playlistState.contextMenuVideoIndex;
  if (index === -1) return;
  
  const video = playlistState.playlistVideos[index];
  showShareModal(
    'video',
    video.videoId,
    video.title,
    `Video from ${video.channel}`,
    `Check out this video: ${video.title}`
  );
  
  closeContextMenu();
}

function removeFromQueue() {
  const index = playlistState.contextMenuVideoIndex;
  if (index === -1) return;
  
  // Don't remove if it's the currently playing video
  if (index === playlistState.currentVideoIndex) {
    showCustomAlert('Cannot remove currently playing video', 'error');
    closeContextMenu();
    return;
  }
  
  const video = playlistState.playlistVideos[index];
  playlistState.playlistVideos.splice(index, 1);
  
  // Update current video index if affected
  if (index < playlistState.currentVideoIndex) {
    playlistState.currentVideoIndex--;
  }
  
  renderPlaylistItems();
  highlightCurrentVideo();
  closeContextMenu();
  
  showCustomAlert('Video removed from queue', 'success');
}

// ENHANCED PLAYLIST RENDERING
function renderPlaylistItems() {
  const itemsContainer = document.getElementById('playlist-items');
  if (!itemsContainer) return;
  
  itemsContainer.innerHTML = '';
  
  playlistState.playlistVideos.forEach((video, index) => {
    const itemElement = document.createElement('div');
    itemElement.className = 'playlist-item';
    itemElement.setAttribute('data-index', index);
    itemElement.draggable = true;
    
    // Add event listeners
    itemElement.addEventListener('dragstart', (e) => handleDragStart(e, index));
    itemElement.addEventListener('dragend', cleanupDrag);
    itemElement.addEventListener('click', (e) => {
      if (!playlistState.isDragging && !e.target.closest('.menu-trigger')) {
        playVideoFromPlaylist(index);
      }
    });
    
    const isActive = index === playlistState.currentVideoIndex;
    
    itemElement.innerHTML = `
      <div class="playlist-item-handle" draggable="true">
        <i class="fas fa-grip-lines"></i>
      </div>
      
      <div class="playlist-item-number">
        ${index + 1}
      </div>
      
      <div class="playlist-item-thumbnail">
        <img src="${sanitize.sanitizeUrl(video.thumbnail) || '/assets/images/default-thumbnail.jpg'}" 
             alt="${sanitize.escapeHtml(video.title) || ''}"
             onerror="this.src='/assets/images/default-thumbnail.jpg'">
      </div>
      
      <div class="playlist-item-info">
        <h3>${sanitize.escapeHtml(video.title) || 'Untitled Video'}</h3>
        <p>${sanitize.escapeHtml(video.channel) || 'Unknown Channel'}</p>
      </div>
      
      <div class="playlist-item-actions">
        <button class="menu-trigger" onclick="event.stopPropagation(); showContextMenu(event, ${index})">
          <i class="fas fa-ellipsis-v"></i>
        </button>
      </div>
    `;
    
    if (isActive) {
      itemElement.classList.add('active');
    }
    
    itemsContainer.appendChild(itemElement);
  });
  
  // Update playlist count
  const playlistCount = document.getElementById('playlist-count');
  if (playlistCount) {
    playlistCount.textContent = 
      `${playlistState.playlistVideos.length} ${playlistState.playlistVideos.length === 1 ? 'song' : 'songs'}`;
  }
}

// Update playVideoFromPlaylist to maintain drag state
async function playVideoFromPlaylist(index) {
  if (playlistState.isDragging) {
    cleanupDrag();
    return;
  }
  
  if (!playlistState.playlistVideos[index]) {
    console.error('No video at index', index);
    return;
  }
  
  playlistState.currentVideoIndex = index;
  const videoId = sanitize.sanitizeText(playlistState.playlistVideos[index].videoId);
  
  if (!playlistState.player) {
    console.error('Player not initialized yet');
    return;
  }
  
  console.log('Loading video:', videoId, 'at index:', index);
  
  try {
    playlistState.player.loadVideoById(videoId);
    
    playlistState.isPlaying = true;
    updatePlayPauseButton();
    updateMiniPlayPauseButton();
    updateVideoInfo();
    updateMiniPlayerContent();
    highlightCurrentVideo();
    updateMediaSessionMetadata();
    
    const favBtn = document.getElementById('favorite-btn');
    if (favBtn) {
      const isFavorited = await checkFavoriteStatus(videoId);
      updateFavoriteButton(favBtn, isFavorited);
    }
  } catch (error) {
    console.error('Error loading video:', error);
    setTimeout(() => playNextVideo(), 500);
  }
}

// Update highlightCurrentVideo for new structure
function highlightCurrentVideo() {
  const items = document.querySelectorAll('.playlist-item');
  items.forEach((item, index) => {
    const isActive = index === playlistState.currentVideoIndex;
    item.classList.toggle('active', isActive);
  });
}

// Enhanced initialization
async function initializePlaylistPage() {
  console.log('🚀 Initializing enhanced playlist page...');
  
  try {
    document.body.classList.add('loading-state');
    initAnimatedBackground();
    // Load APIs
    await loadYouTubeAPI().catch(error => {
      console.error('Google API load failed:', error);
      throw new Error('Failed to load YouTube API. Please check your connection.');
    });

    await loadYouTubeIframeAPI().catch(error => {
      console.error('YouTube IFrame API load failed:', error);
      throw new Error('Failed to load video player.');
    });

    await createYouTubePlayer().catch(error => {
      console.error('Player creation failed:', error);
      throw new Error('Failed to initialize video player.');
    });

    const urlParams = new URLSearchParams(window.location.search);
    const playlistId = sanitize.sanitizeText(urlParams.get('list'));
    
    if (!playlistId) {
      throw new Error('No playlist ID provided in URL');
    }

    playlistState.currentPlaylistId = playlistId;
    
    showCustomAlert('Loading playlist...', 'info', 3000);
    
    await Promise.all([
      fetchPlaylistDetails(playlistId).catch(error => {
        console.error('Playlist details failed:', error);
        showCustomAlert('Failed to load playlist details', 'warning');
      }),
      fetchPlaylistItems(playlistId).catch(error => {
        console.error('Playlist items failed:', error);
        showCustomAlert('Failed to load playlist videos', 'warning');
      })
    ]);

    // Initialize enhanced systems
    initDragAndDrop();
    initContextMenus();
    initPlaylistControls();
    initCopyPlaylistButton();
    initSavePlaylistButton();
    initShareButtons();
    initOpenVideoButton();
    initSleepTimer();
    initScrollToPlaylistButton();
    initMiniPlayer();
    initNewHeader();
    initPremiumNavigation();
    // In initializePlaylistPage() function, add this:
initProgressBar();

    console.log('✅ Enhanced playlist page initialized successfully');
    
  } catch (error) {
    console.error('Initialization error:', error);
    showCustomAlert(error.message || 'Failed to initialize player. Please refresh the page.', 'error', 5000);
    
  } finally {
    document.body.classList.remove('loading-state');
  }
}

// Make functions globally available for HTML onclick
// Make functions globally available for HTML onclick
window.showContextMenu = showContextMenu;
window.playNextFromMenu = playNextFromMenu;
window.shareVideoFromMenu = shareVideoFromMenu;
window.removeFromQueue = removeFromQueue;
window.playFromSearch = playFromSearch; // ADD THIS LINE
window.searchOnYouTube = searchOnYouTube; // ADD THIS LINE
// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded - Initializing enhanced playlist page');
  
  authModal.init();
  initializePlaylistPage().catch(error => {
    console.error('Initialization failed:', error);
  });
});

// Export for module use
export { initializePlaylistPage };

// Load YouTube API
async function loadYouTubeAPI() {
  return new Promise((resolve, reject) => {
    if (window.gapi && window.gapi.client) {
      console.log('Google API already loaded');
      resolve();
      return;
    }
    
    gapi.load('client', {
      callback: () => {
        gapi.client.init({
          'apiKey': 'AIzaSyDSbmwh-_-61_Cpl21Y54GahsLVCbOmMYA',
          'discoveryDocs': ['https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest']
        }).then(resolve).catch(reject);
      },
      onerror: () => reject(new Error('Failed to load Google API'))
    });
  });
}

// Load YouTube Iframe API
function loadYouTubeIframeAPI() {
  return new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) {
      console.log('YouTube Iframe API already loaded');
      resolve();
      return;
    }

    console.log('Loading YouTube Iframe API script');
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    tag.onerror = () => reject(new Error('Failed to load YouTube IFrame API'));
    
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    // Set timeout for API loading
    const loadTimeout = setTimeout(() => {
      reject(new Error('YouTube IFrame API loading timeout'));
    }, 10000);

    window.onYouTubeIframeAPIReady = function() {
      clearTimeout(loadTimeout);
      console.log('YouTube Iframe API ready callback received');
      resolve();
    };

    // Fallback detection
    const fallbackCheck = setInterval(() => {
      if (window.YT && window.YT.Player) {
        clearTimeout(loadTimeout);
        clearInterval(fallbackCheck);
        console.log('YouTube Iframe API loaded (fallback detection)');
        resolve();
      }
    }, 500);
  });
}

// Create YouTube Player
function createYouTubePlayer() {
  return new Promise((resolve, reject) => {
    console.log('Creating YouTube player instance');
    
    const playerContainer = document.getElementById('player');
    if (!playerContainer) {
      reject(new Error('Player container not found'));
      return;
    }

    // Clear any existing player
    playerContainer.innerHTML = '';
    
    let playerReady = false;
    const playerTimeout = setTimeout(() => {
      if (!playerReady) {
        reject(new Error('Player initialization timeout'));
      }
    }, 8000);

    try {
      playlistState.player = new YT.Player('player', {
        height: '240',
        width: '426',
        events: {
          'onReady': (event) => {
            clearTimeout(playerTimeout);
            playerReady = true;
            console.log('YouTube Player is ready');
            playlistState.playerReady = true;
            onPlayerReady(event);
            resolve(event.target);
          },
          'onStateChange': onPlayerStateChange,
          'onError': (event) => {
            console.error('Player error:', event.data);
            // Don't reject here as errors are handled in onPlayerStateChange
          }
        },
        playerVars: {
          'autoplay': 1, // Auto-play first video
          'controls': 1,
          'rel': 0,
          'modestbranding': 1,
          'fs': 1,
          'iv_load_policy': 3,
          'playsinline': 1,
          'disablekb': 0,
          'cc_load_policy': 0,
          'widget_referrer': window.location.href,
          'origin': window.location.origin,
          'enablejsapi': 1
        }
      });
    } catch (error) {
      clearTimeout(playerTimeout);
      reject(new Error(`Player creation error: ${error.message}`));
    }
  });
}

// Core Player Functions
function onPlayerReady(event) {
  console.log('Player ready event received');
  
  // Load the first video immediately when player is ready
  if (playlistState.playlistVideos.length > 0) {
    console.log('Auto-playing first video from playlist');
    playVideoFromPlaylist(0);
  } else {
    console.log('No videos loaded yet, waiting for playlist data...');
  }
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ERROR) {
    console.error('Player error detected');
    let errorCode;
    try {
      errorCode = playlistState.player.getPlayerState().errorCode;
    } catch (e) {
      errorCode = -1;
    }
    
    const permanentErrors = [2, 5, 100, 101, 150];
    
    if (permanentErrors.includes(errorCode)) {
      console.error('Permanent error detected, skipping video...');
      showCustomAlert('Skipping unavailable video', 'warning');
      setTimeout(() => playNextVideo(), 3000);
    } else {
      console.warn('Temporary error detected, retrying...');
      showCustomAlert('Connection issue, retrying...', 'warning');
      
      let retryCount = 0;
      const maxRetries = 2;
      
      const retryInterval = setInterval(() => {
        retryCount++;
        if (retryCount <= maxRetries && playlistState.player) {
          console.log(`Retry attempt ${retryCount}`);
          try {
            playlistState.player.loadVideoById(
              playlistState.playlistVideos[playlistState.currentVideoIndex].videoId
            );
          } catch (e) {
            console.error('Retry failed:', e);
          }
        } else {
          clearInterval(retryInterval);
          console.error('Max retries reached, skipping video');
          setTimeout(() => playNextVideo(), 7000);
        }
      }, 5000);
    }
    return;
  }

  if (event.data === YT.PlayerState.ENDED) {
    if (playlistState.isRepeat) {
      try {
        event.target.playVideo();
      } catch (e) {
        console.error('Repeat play failed:', e);
      }
    } else {
      playNextVideo();
    }
  }
  
  if (event.data === YT.PlayerState.PLAYING) {
    playlistState.isPlaying = true;
    updatePlayPauseButton();
    updateMiniPlayPauseButton();
    updateVideoInfo();
    updateMiniPlayerContent();
    updateMediaSessionMetadata();
    updateMediaSessionPlaybackState();
    try {
      document.querySelector('.ytp-endscreen-content')?.style.setProperty('display', 'none', 'important');
    } catch (e) {
      // Ignore DOM errors
    }
  }
  else if (event.data === YT.PlayerState.PAUSED) {
    playlistState.isPlaying = false;
    updatePlayPauseButton();
    updateMiniPlayPauseButton();
    updateMediaSessionPlaybackState();
  }
}
// Update the onPlayerStateChange function to handle progress tracking


// Update playVideoFromPlaylist to reset progress bar and timestamps
  
  // Load timestamps for the new video after a short delay
  // Update playVideoFromPlaylist to reset progress bar and timestamps
// Update the playVideoFromPlaylist function to properly reset progress
// Update the playVideoFromPlaylist function for better sync
const originalPlayVideoFromPlaylist = playVideoFromPlaylist;
playVideoFromPlaylist = function(index) {
  // Stop current progress tracking
  stopProgressTracking();
  
  // Reset progress bar immediately
  resetProgressBar();
  
  // Call original function
  originalPlayVideoFromPlaylist.call(this, index);
  
  // Start tracking immediately and restart after video loads
  let loadAttempts = 0;
  const maxLoadAttempts = 10;
  
  const waitForVideoLoad = setInterval(() => {
    loadAttempts++;
    
    if (playlistState.player && playlistState.player.getDuration && playlistState.player.getDuration() > 0) {
      clearInterval(waitForVideoLoad);
      startProgressTracking();
    } else if (loadAttempts >= maxLoadAttempts) {
      clearInterval(waitForVideoLoad);
      // Fallback: start tracking anyway after timeout
      setTimeout(() => {
        if (playlistState.playerReady) {
          startProgressTracking();
        }
      }, 1000);
    }
  }, 300);
};
function playNextVideo() {
  if (playlistState.playlistVideos.length === 0) return;
  
  let nextIndex;
  
  if (playlistState.isShuffled) {
    if (playlistState.currentVideoIndex >= playlistState.playlistVideos.length - 1) {
      nextIndex = 0;
    } else {
      nextIndex = playlistState.currentVideoIndex + 1;
    }
  } else {
    if (playlistState.currentVideoIndex < playlistState.playlistVideos.length - 1) {
      nextIndex = playlistState.currentVideoIndex + 1;
    } else {
      nextIndex = 0;
    }
  }
  
  playVideoFromPlaylist(nextIndex);
}

function playPreviousVideo() {
  if (playlistState.currentVideoIndex > 0) {
    playVideoFromPlaylist(playlistState.currentVideoIndex - 1);
  } else {
    // Wrap around to last video
    playVideoFromPlaylist(playlistState.playlistVideos.length - 1);
  }
}

function togglePlayPause() {
  if (!playlistState.player) {
    console.error('Player not available for play/pause');
    return;
  }
  
  try {
    if (playlistState.isPlaying) {
      playlistState.player.pauseVideo();
    } else {
      playlistState.player.playVideo();
    }
  } catch (error) {
    console.error('Play/pause error:', error);
    showCustomAlert('Player control error', 'error');
  }
}

// UI Update Functions
function updateVideoInfo() {
  const currentVideo = playlistState.playlistVideos[playlistState.currentVideoIndex];
  if (currentVideo) {
    const fullTitle = sanitize.escapeHtml(currentVideo.title) || 'Untitled Video';
    const truncatedTitle = fullTitle.length > 60 ? fullTitle.substring(0, 60) + '...' : fullTitle;
    
    // Update both title versions
    const collapsedTitle = document.getElementById('video-title-collapsed');
    const expandedTitle = document.getElementById('video-title-expanded');
    
    if (collapsedTitle) collapsedTitle.textContent = truncatedTitle;
    if (expandedTitle) expandedTitle.textContent = fullTitle;
    
    // Update description with enhanced formatting
    const descriptionElement = document.getElementById('video-description');
    if (descriptionElement) {
      descriptionElement.innerHTML = formatDescription(currentVideo.description) || 'No description available';
      addDescriptionEventListeners(descriptionElement);
    }
  } else {
    console.log('No current video to update info');
  }
}

function updatePlaylistInfo(title, description) {
  const fullTitle = sanitize.escapeHtml(title) || 'Untitled Playlist';
  const truncatedTitle = fullTitle.length > 60 ? fullTitle.substring(0, 60) + '...' : fullTitle;
  
  // Update both title versions
  const collapsedTitle = document.getElementById('playlist-title-collapsed');
  const expandedTitle = document.getElementById('playlist-title-expanded');
  
  if (collapsedTitle) collapsedTitle.textContent = truncatedTitle;
  if (expandedTitle) expandedTitle.textContent = fullTitle;
  
  // Update description with enhanced formatting
  const descriptionElement = document.getElementById('playlist-description');
  if (descriptionElement) {
    descriptionElement.innerHTML = formatDescription(description) || 'No description available';
    addDescriptionEventListeners(descriptionElement);
  }
}

function updatePlayPauseButton() {
  const btn = document.getElementById('play-pause-btn');
  if (btn) {
    btn.innerHTML = playlistState.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
  }
}

function toggleShuffle() {
  playlistState.isShuffled = !playlistState.isShuffled;
  const shuffleBtn = document.getElementById('shuffle-btn');
  if (shuffleBtn) {
    shuffleBtn.classList.toggle('active', playlistState.isShuffled);
  }
  
  // Update mini player shuffle button
  const miniShuffleBtn = document.getElementById('mini-shuffle-btn');
  if (miniShuffleBtn) {
    miniShuffleBtn.classList.toggle('active', playlistState.isShuffled);
  }
  
  if (playlistState.isShuffled) {
    if (playlistState.originalPlaylistOrder.length === 0) {
      playlistState.originalPlaylistOrder = [...playlistState.playlistVideos];
    }
    shufflePlaylist();
  } else if (playlistState.originalPlaylistOrder.length > 0) {
    playlistState.playlistVideos = [...playlistState.originalPlaylistOrder];
    playlistState.originalPlaylistOrder = [];
    renderPlaylistItems();
    const currentVideoId = playlistState.playlistVideos[playlistState.currentVideoIndex].videoId;
    const newIndex = playlistState.playlistVideos.findIndex(v => v.videoId === currentVideoId);
    if (newIndex !== -1) {
      playlistState.currentVideoIndex = newIndex;
    }
    highlightCurrentVideo();
  }
}

function toggleRepeat() {
  playlistState.isRepeat = !playlistState.isRepeat;
  const repeatBtn = document.getElementById('repeat-btn');
  if (repeatBtn) {
    repeatBtn.classList.toggle('active', playlistState.isRepeat);
  }
  
  // Update mini player repeat button
  const miniRepeatBtn = document.getElementById('mini-repeat-btn');
  if (miniRepeatBtn) {
    miniRepeatBtn.classList.toggle('active', playlistState.isRepeat);
  }
}

function shufflePlaylist() {
  const currentVideo = playlistState.playlistVideos[playlistState.currentVideoIndex];
  
  for (let i = playlistState.playlistVideos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playlistState.playlistVideos[i], playlistState.playlistVideos[j]] = 
      [playlistState.playlistVideos[j], playlistState.playlistVideos[i]];
  }
  
  const newIndex = playlistState.playlistVideos.findIndex(v => v.videoId === currentVideo.videoId);
  if (newIndex !== -1) {
    playlistState.currentVideoIndex = newIndex;
  } else {
    playlistState.currentVideoIndex = 0;
  }
  
  renderPlaylistItems();
}

// Data Fetching Functions
async function fetchChannelLogo(channelId) {
  try {
    const response = await gapi.client.youtube.channels.list({
      part: 'snippet',
      id: channelId,
      fields: 'items(snippet(thumbnails(default)))'
    });
    
    if (response.result.items?.[0]?.snippet?.thumbnails?.default?.url) {
      const logoUrl = sanitize.sanitizeUrl(response.result.items[0].snippet.thumbnails.default.url);
      const channelLogo = document.getElementById('channel-logo');
      if (channelLogo) {
        channelLogo.src = logoUrl;
      }
      return logoUrl;
    }
  } catch (error) {
    console.error('Error fetching channel logo:', error);
  }
  return '';
}

async function fetchPlaylistItems(playlistId, retryCount = 0) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000;
  
  const safePlaylistId = sanitize.sanitizeText(playlistId);
  const itemsContainer = document.getElementById('playlist-items');
  
  if (!itemsContainer) return;

  try {
    itemsContainer.innerHTML = `
      <div class="wave-reloader">
        <div class="wave-bars">
          <div class="wave-bar"></div>
          <div class="wave-bar"></div>
          <div class="wave-bar"></div>
          <div class="wave-bar"></div>
          <div class="wave-bar"></div>
        </div>
        <p> ${retryCount > 0 ? `(Retry ${retryCount}/${MAX_RETRIES})` : ''}</p>
      </div>
    `;

    let nextPageToken = '';
    let allItems = [];
    
    do {
      const response = await gapi.client.youtube.playlistItems.list({
        part: 'snippet',
        playlistId: safePlaylistId,
        maxResults: 50,
        pageToken: nextPageToken
      });
      
      if (response.result.items) {
        allItems = [...allItems, ...response.result.items];
      }
      
      nextPageToken = response.result.nextPageToken || '';
    } while (nextPageToken);

    if (allItems.length === 0 && retryCount < MAX_RETRIES) {
      throw new Error('Empty response from YouTube');
    }

    playlistState.playlistVideos = allItems
      .filter(item => item.snippet?.resourceId?.videoId)
      .map(item => ({
        videoId: sanitize.sanitizeText(item.snippet.resourceId.videoId),
        title: sanitize.escapeHtml(item.snippet.title),
        thumbnail: sanitize.sanitizeUrl(item.snippet.thumbnails?.default?.url),
        channel: sanitize.escapeHtml(item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle),
        description: sanitize.escapeHtml(item.snippet.description) || 'No description available'
      }));

    const playlistCount = document.getElementById('playlist-count');
    if (playlistCount) {
      playlistCount.textContent = 
        `${playlistState.playlistVideos.length} ${playlistState.playlistVideos.length === 1 ? 'song' : 'songs'}`;
    }
    
    renderPlaylistItems();
    
    // AUTO-PLAY FIRST VIDEO when playlist is loaded
    if (playlistState.playlistVideos.length > 0) {
      console.log('🎉 Playlist loaded with', playlistState.playlistVideos.length, 'videos. Auto-playing first video...');
      
      // Cancel recovery timers since we successfully loaded
      cancelRecoveryTimers();
      
      if (playlistState.playerReady) {
        // Player is ready, play immediately
        playVideoFromPlaylist(0);
      } else {
        // Player not ready yet, wait a bit and try again
        console.log('⏳ Player not ready yet, waiting...');
        setTimeout(() => {
          if (playlistState.playerReady) {
            playVideoFromPlaylist(0);
          }
        }, 1000);
      }
    } else {
      console.log('❌ Playlist loaded but no videos found');
    }
    
  } catch (error) {
    console.error('Error fetching playlist items:', error);
    
    if (retryCount < MAX_RETRIES) {
      setTimeout(() => fetchPlaylistItems(playlistId, retryCount + 1), RETRY_DELAY);
    } else {
      itemsContainer.innerHTML = `
        <div class="error">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Failed to load playlist</p>
          <div class="error-actions">
            <button class="retry-btn" onclick="fetchPlaylistItems('${safePlaylistId}')">
              <i class="fas fa-sync-alt"></i> Try Again
            </button>
          </div>
        </div>
      `;
    }
  }
}
async function fetchPlaylistDetails(playlistId) {
  const safePlaylistId = sanitize.sanitizeText(playlistId);
  try {
    const response = await gapi.client.youtube.playlists.list({
      part: 'snippet',
      id: safePlaylistId,
      fields: 'items(snippet(title,description,channelTitle,channelId))'
    });
    
    console.log('Playlist API response:', response);
    
    if (response.result.items?.[0]?.snippet) {
      const playlist = response.result.items[0].snippet;
      
      // Use enhanced formatting for playlist info
      updatePlaylistInfo(
        playlist.title || 'Untitled Playlist',
        playlist.description || 'No description available'
      );
      
      const channelHandle = await getChannelHandle(playlist.channelId);
      
      playlistState.channelInfo = {
        name: sanitize.escapeHtml(playlist.channelTitle) || 'Unknown Channel',
        id: sanitize.sanitizeText(playlist.channelId) || '',
        handle: sanitize.escapeHtml(channelHandle) || ''
      };
      
      // UPDATE HEADER CHANNEL NAME - ADD THIS LINE
      updateHeaderChannelName();
      
      const channelName = document.getElementById('channel-name');
      const channelHandleElement = document.getElementById('channel-handle');
      
      if (channelName) channelName.textContent = playlistState.channelInfo.name;
      if (channelHandleElement) {
        channelHandleElement.textContent =
          playlistState.channelInfo.handle ? `@${playlistState.channelInfo.handle}` : '';
      }
      
      if (playlistState.channelInfo.id) {
        const logoUrl = await fetchChannelLogo(playlistState.channelInfo.id);
        
        const btn = document.getElementById('subscribe-btn');
        if (btn) {
          const isSubscribed = await checkSubscriptionStatus(playlistState.channelInfo.id);
          updateSubscribeButton(btn, isSubscribed);
          btn.addEventListener('click', toggleSubscription);
        }
      }
    } else {
      console.warn('No playlist data found in response');
      updatePlaylistInfo('Untitled Playlist', 'No description available');
      // Also update header with default name if no data
      updateHeaderChannelName();
    }
  } catch (error) {
    console.error('Error fetching playlist details:', error);
    updatePlaylistInfo('Untitled Playlist', 'No description available');
    // Update header even on error
    updateHeaderChannelName();
    showCustomAlert('Failed to load playlist details', 'error');
  }
}
async function getChannelHandle(channelId) {
  try {
    const response = await gapi.client.youtube.channels.list({
      part: 'snippet',
      id: channelId,
      fields: 'items(snippet(customUrl))'
    });
    
    if (response.result.items?.[0]?.snippet?.customUrl) {
      return response.result.items[0].snippet.customUrl.replace('@', '');
    }
    return '';
  } catch (error) {
    console.error('Error fetching channel handle:', error);
    return '';
  }
}

// Initialize playlist controls
 // In initPlaylistControls() function - UPDATE ONLY THIS PART:
function initPlaylistControls() {
  // Favorite button - UPDATE THIS LINE ONLY:
  document.getElementById('favorite-btn')?.addEventListener('click', () => {
    const videoId = playlistState.playlistVideos[playlistState.currentVideoIndex].videoId;
    toggleFavoriteEnhanced(videoId); // CHANGED: Use enhanced version
  });
  
  // ALL OTHER CONTROLS REMAIN EXACTLY THE SAME:
  const playPauseBtn = document.getElementById('play-pause-btn');
  playPauseBtn?.addEventListener('click', () => {
    togglePlayPause();
    updateMediaSessionPlaybackState();
  });
  
  document.getElementById('prev-btn')?.addEventListener('click', () => {
    playPreviousVideo();
    updateMediaSessionPlaybackState();
  });
  
  document.getElementById('next-btn')?.addEventListener('click', () => {
    playNextVideo();
    updateMediaSessionPlaybackState();
  });
  
  document.getElementById('shuffle-btn')?.addEventListener('click', toggleShuffle);
  document.getElementById('repeat-btn')?.addEventListener('click', toggleRepeat);
  document.getElementById('play-all-btn')?.addEventListener('click', () => {
    playVideoFromPlaylist(0);
  });
  
  // Initialize Bluetooth/media controls
  setupMediaControls();
}
// OPTIMIZED: Copy playlist - NO duplicate video data
async function copyPlaylistToSharedCollection(playlistName, playlistDescription, visibility) {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  try {
    console.log('Starting playlist copy process...');

    // 1. Create the main playlist document
    const playlistRef = doc(collection(db, 'copiedPlaylists'));
    const playlistData = {
      id: playlistRef.id,
      name: sanitize.sanitizeText(playlistName),
      description: sanitize.sanitizeText(playlistDescription),
      visibility: visibility,
      ownerId: user.uid,
      ownerName: user.displayName || 'Anonymous',
      ownerEmail: user.email || '',
      ownerPhotoURL: user.photoURL || '',
      originalPlaylistId: playlistState.currentPlaylistId,
      originalPlaylistTitle: document.getElementById('playlist-title-expanded').textContent,
      originalChannelId: playlistState.channelInfo.id,
      originalChannelName: playlistState.channelInfo.name,
      videoCount: 0,
      thumbnail: playlistState.playlistVideos[0]?.thumbnail || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    console.log('Creating playlist document...');
    await setDoc(playlistRef, playlistData);

    // 2. Add user reference
    const userPlaylistRef = doc(db, 'users', user.uid, 'copiedPlaylistsRefs', playlistRef.id);
    await setDoc(userPlaylistRef, {
      playlistId: playlistRef.id,
      name: playlistData.name,
      thumbnail: playlistData.thumbnail,
      videoCount: 0,
      createdAt: playlistData.createdAt,
      updatedAt: playlistData.updatedAt,
      visibility: playlistData.visibility
    });

    // 3. Process videos with progress tracking
    console.log('Processing videos...');
    let addedCount = 0;
    let batch = writeBatch(db);
    let batchCount = 0;
    
    const progressFill = document.getElementById('modern-progress-fill');
    const progressPercentage = document.getElementById('modern-progress-percentage');
    const copiedCountElement = document.getElementById('modern-copied-count');
    const progressText = document.getElementById('modern-progress-text');
    
    for (const video of playlistState.playlistVideos) {
      progressText.textContent = `Caching video ${addedCount + 1} of ${playlistState.playlistVideos.length}...`;
      
      // Ensure video is in shared cache
      let cachedVideo = await videoCache.getVideoFromCache(video.videoId);
      if (!cachedVideo) {
        console.log(`Caching video: ${video.videoId}`);
        await videoCache.addVideoToCache(video);
      }
      
      // Store video ID and position
      const videoRef = doc(collection(db, 'copiedPlaylists', playlistRef.id, 'videos'), video.videoId);
      batch.set(videoRef, {
        videoId: sanitize.sanitizeText(video.videoId),
        position: addedCount,
        addedAt: new Date().toISOString()
      });
      
      addedCount++;
      batchCount++;

      // Update progress
      updateProgress(addedCount, playlistState.playlistVideos.length, progressFill, progressPercentage, copiedCountElement);

      // Commit batch every 50 operations or at the end
      if (batchCount >= 50 || addedCount === playlistState.playlistVideos.length) {
        console.log(`Committing batch with ${batchCount} videos...`);
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
        
        // Small delay to prevent overwhelming the database
        if (addedCount < playlistState.playlistVideos.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    // 4. Update counts
    console.log('Updating final counts...');
    await updateDoc(playlistRef, {
      videoCount: addedCount,
      updatedAt: new Date().toISOString()
    });

    await updateDoc(userPlaylistRef, {
      videoCount: addedCount,
      updatedAt: new Date().toISOString()
    });

    console.log(`Playlist copy completed: ${addedCount} videos added`);
    
    return {
      playlistId: playlistRef.id,
      addedCount: addedCount
    };

  } catch (error) {
    console.error('Error copying playlist:', error);
    throw error;
  }
}

// FIXED ADD TO EXISTING PLAYLIST FUNCTION
async function addToExistingPlaylist(targetPlaylistId) {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  try {
    console.log('Adding to existing playlist:', targetPlaylistId);

    const playlistRef = doc(db, 'copiedPlaylists', targetPlaylistId);
    const playlistDoc = await getDoc(playlistRef);
    
    if (!playlistDoc.exists()) {
      throw new Error('Playlist not found');
    }

    if (playlistDoc.data().ownerId !== user.uid) {
      throw new Error('You do not own this playlist');
    }

    // Get existing videos to avoid duplicates
    const existingVideosRef = collection(db, 'copiedPlaylists', targetPlaylistId, 'videos');
    const existingSnapshot = await getDocs(existingVideosRef);
    const existingVideoIds = new Set(existingSnapshot.docs.map(doc => doc.id));

    let addedCount = 0;
    let batch = writeBatch(db);
    let batchCount = 0;
    const startPosition = existingSnapshot.size;

    const progressFill = document.getElementById('modern-progress-fill');
    const progressPercentage = document.getElementById('modern-progress-percentage');
    const copiedCountElement = document.getElementById('modern-copied-count');
    const progressText = document.getElementById('modern-progress-text');

    for (const video of playlistState.playlistVideos) {
      // Skip if video already exists in playlist
      if (existingVideoIds.has(video.videoId)) {
        console.log(`Skipping duplicate video: ${video.videoId}`);
        continue;
      }

      progressText.textContent = `Adding video ${addedCount + 1} of ${playlistState.playlistVideos.length}...`;

      // Ensure video is in shared cache
      let cachedVideo = await videoCache.getVideoFromCache(video.videoId);
      if (!cachedVideo) {
        console.log(`Caching video: ${video.videoId}`);
        await videoCache.addVideoToCache(video);
      }

      // Store video ID and position
      const videoRef = doc(collection(db, 'copiedPlaylists', targetPlaylistId, 'videos'), video.videoId);
      batch.set(videoRef, {
        videoId: sanitize.sanitizeText(video.videoId),
        position: startPosition + addedCount,
        addedAt: new Date().toISOString()
      });

      addedCount++;
      batchCount++;

      // Update progress
      updateProgress(addedCount, playlistState.playlistVideos.length, progressFill, progressPercentage, copiedCountElement);

      // Commit batch every 50 operations or at the end
      if (batchCount >= 50 || addedCount === playlistState.playlistVideos.length) {
        console.log(`Committing batch with ${batchCount} videos...`);
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
        
        // Small delay to prevent overwhelming the database
        if (addedCount < playlistState.playlistVideos.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    // Update playlist counts if videos were added
    if (addedCount > 0) {
      const currentCount = playlistDoc.data().videoCount || 0;
      await updateDoc(playlistRef, {
        videoCount: currentCount + addedCount,
        updatedAt: new Date().toISOString()
      });

      const userPlaylistRef = doc(db, 'users', user.uid, 'copiedPlaylistsRefs', targetPlaylistId);
      await updateDoc(userPlaylistRef, {
        videoCount: currentCount + addedCount,
        updatedAt: new Date().toISOString()
      });
    }

    console.log(`Added ${addedCount} videos to existing playlist`);
    return addedCount;

  } catch (error) {
    console.error('Error adding to existing playlist:', error);
    throw error;
  }
}

// Load user's copied playlists from references
async function loadUserCopiedPlaylists() {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  try {
    const userPlaylistsRef = collection(db, 'users', user.uid, 'copiedPlaylistsRefs');
    const userPlaylistsSnapshot = await getDocs(userPlaylistsRef);
    
    if (userPlaylistsSnapshot.empty) {
      playlistState.userPlaylists = [];
      return;
    }

    const playlistPromises = userPlaylistsSnapshot.docs.map(async (refDoc) => {
      const refData = refDoc.data();
      const playlistDoc = await getDoc(doc(db, 'copiedPlaylists', refData.playlistId));
      
      if (playlistDoc.exists()) {
        const data = playlistDoc.data();
        return {
          id: playlistDoc.id,
          name: sanitize.escapeHtml(data.name),
          description: sanitize.escapeHtml(data.description),
          visibility: data.visibility,
          videoCount: data.videoCount || 0,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          ownerId: data.ownerId,
          ownerName: data.ownerName,
          thumbnail: data.thumbnail,
          playCount: data.playCount || 0,
          likes: data.likes || 0
        };
      }
      return null;
    });

    const playlists = await Promise.all(playlistPromises);
    playlistState.userPlaylists = playlists.filter(Boolean).sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );

  } catch (error) {
    console.error('Error loading user playlists:', error);
    playlistState.userPlaylists = [];
    throw error;
  }
}

// Unique Name Validation
async function isPlaylistNameUnique(name) {
  const safeName = sanitize.sanitizeText(name);
  const user = auth.currentUser;
  if (!user) return false;
  
  try {
    const userPlaylistsRef = collection(db, 'users', user.uid, 'copiedPlaylistsRefs');
    const userPlaylistsSnapshot = await getDocs(userPlaylistsRef);
    
    return !userPlaylistsSnapshot.docs.some(doc => 
      doc.data().name.toLowerCase() === safeName.toLowerCase()
    );
  } catch (error) {
    console.error('Error checking playlist name:', error);
    return false;
  }
}

// Render playlist options
function renderPlaylistOptions() {
  const container = document.getElementById('user-playlists-list');
  
  if (playlistState.userPlaylists.length === 0) {
    container.innerHTML = `
      <div class="no-playlists">
        <i class="fas fa-music"></i>
        <p>You don't have any playlists yet</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = playlistState.userPlaylists.map(playlist => `
    <div class="playlist-option">
      <input type="radio" name="target-playlist" id="playlist-${sanitize.escapeHtml(playlist.id)}" value="${sanitize.escapeHtml(playlist.id)}">
      <label for="playlist-${sanitize.escapeHtml(playlist.id)}" class="radio-label">
        <i class="fas fa-list-ul"></i>
        <div class="playlist-info">
          <span class="playlist-name">${sanitize.escapeHtml(playlist.name)}</span>
          <span class="playlist-meta">
            ${playlist.videoCount || 0} videos • ${sanitize.escapeHtml(playlist.visibility)}
            ${playlist.description ? `<span class="playlist-description">${sanitize.escapeHtml(playlist.description)}</span>` : ''}
          </span>
          <span class="playlist-owner">By ${sanitize.escapeHtml(playlist.ownerName)}</span>
        </div>
      </label>
    </div>
  `).join('');
}

// Show playlist selection modal
// MODERN COPY PLAYLIST MODAL
let isCopyInProgress = false; // Global flag to prevent multiple copies

async function showPlaylistSelectionModal() {
  // Prevent opening multiple modals
  if (document.querySelector('.modern-copy-modal')) {
    return;
  }

  const safeVideoCount = sanitize.escapeHtml(playlistState.playlistVideos.length.toString());
  const playlistTitle = document.getElementById('playlist-title-expanded').textContent;
  const safePlaylistTitle = sanitize.escapeHtml(playlistTitle);
  
  const modalHTML = `
    <div class="modal-overlay active">
      <div class="modal-content modern-copy-modal">
        <div class="modal-header">
          <h3><i class="fas fa-copy"></i> Copy Playlist</h3>
          <button class="modal-close"><i class="fas fa-times"></i></button>
        </div>
        
        <!-- Stats Bar -->
        <div class="copy-stats-bar">
          <div class="stat-item">
            <i class="fas fa-list-ul"></i>
            <span>${safeVideoCount} videos</span>
          </div>
          <div class="stat-item">
            <i class="fas fa-music"></i>
            <span>"${safePlaylistTitle}"</span>
          </div>
          <div class="stat-item">
            <i class="fas fa-clock"></i>
            <span>Ready to copy</span>
          </div>
        </div>
        
        <div class="modern-copy-content">
          <div class="modern-loading-spinner" id="modern-loading-spinner">
            <div class="modern-spinner"></div>
            <p class="modern-loading-text">Loading your playlists...</p>
          </div>
          
          <div class="modern-selection-options" style="display:none;">
            <!-- Existing Playlists Section -->
            <div class="modern-section">
              <div class="modern-section-header">
                <i class="fas fa-folder-open"></i>
                <div>
                  <h4 class="modern-section-title">Your Playlists</h4>
                  <p class="modern-section-subtitle">Select an existing playlist to add these videos</p>
                </div>
              </div>
              
              <div id="modern-playlists-list" class="modern-playlist-list">
                <!-- Playlists will be rendered here -->
              </div>
              
              <div class="modern-empty-state" id="modern-no-playlists" style="display: none;">
                <i class="fas fa-music modern-empty-icon"></i>
                <h4>No Playlists Yet</h4>
                <p>You haven't created any playlists. Start by creating your first one!</p>
                <button class="modern-create-btn" id="modern-create-first-btn">
                  <i class="fas fa-plus"></i>Create First Playlist
                </button>
              </div>
            </div>
            
            <!-- New Playlist Section -->
            <div class="modern-section">
              <div class="modern-section-header">
                <i class="fas fa-plus-circle"></i>
                <div>
                  <h4 class="modern-section-title">Create New Playlist</h4>
                  <p class="modern-section-subtitle">Make a new playlist with these videos</p>
                </div>
              </div>
              
              <div class="modern-playlist-option">
                <input type="radio" name="modern-target-playlist" id="modern-new-playlist-radio" value="new">
                <label for="modern-new-playlist-radio" class="modern-radio-label">
                  <div class="playlist-option-icon">
                    <i class="fas fa-plus"></i>
                  </div>
                  <div class="modern-playlist-info">
                    <span class="modern-playlist-name">Create New Playlist</span>
                    <div class="modern-playlist-meta">
                      <span class="meta-item">New Collection</span>
                    </div>
                    <div class="modern-playlist-description">Start fresh with a brand new playlist</div>
                  </div>
                </label>
                
                <div id="modern-new-playlist-form" class="modern-new-playlist-form" style="display: none;">
                  <div class="modern-form-group">
                    <label class="modern-form-label" for="modern-playlist-name">Playlist Name *</label>
                    <input type="text" id="modern-playlist-name" class="modern-form-input" placeholder="My Awesome Playlist" required>
                    <span class="modern-form-error" id="modern-name-error"></span>
                  </div>
                  
                  <div class="modern-form-group">
                    <label class="modern-form-label" for="modern-playlist-description">
                      Description <span style="color: rgba(255,255,255,0.4); font-weight: normal;">(optional)</span>
                    </label>
                    <textarea id="modern-playlist-description" class="modern-form-input modern-form-textarea" placeholder="Describe what makes this playlist special..."></textarea>
                  </div>
                  
                  <div class="modern-form-group">
                    <label class="modern-form-label">Visibility</label>
                    <div class="modern-visibility-options">
                      <div class="modern-visibility-option">
                        <input type="radio" name="modern-visibility" id="modern-visibility-public" value="public" checked>
                        <label for="modern-visibility-public" class="modern-visibility-label">
                          <i class="fas fa-globe-americas"></i>
                          <span class="visibility-type">Public</span>
                          <span class="visibility-desc">Anyone can see</span>
                        </label>
                      </div>
                      <div class="modern-visibility-option">
                        <input type="radio" name="modern-visibility" id="modern-visibility-unlisted" value="unlisted">
                        <label for="modern-visibility-unlisted" class="modern-visibility-label">
                          <i class="fas fa-link"></i>
                          <span class="visibility-type">Unlisted</span>
                          <span class="visibility-desc">Only with link</span>
                        </label>
                      </div>
                      <div class="modern-visibility-option">
                        <input type="radio" name="modern-visibility" id="modern-visibility-private" value="private">
                        <label for="modern-visibility-private" class="modern-visibility-label">
                          <i class="fas fa-lock"></i>
                          <span class="visibility-type">Private</span>
                          <span class="visibility-desc">Only you</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Progress Section -->
          <div class="modern-progress-section" id="modern-progress-container" style="display:none;">
            <div class="modern-progress-info">
              <span class="modern-progress-text" id="modern-progress-text">Preparing to copy videos...</span>
              <span class="modern-progress-percentage" id="modern-progress-percentage">0%</span>
            </div>
            <div class="modern-progress-bar">
              <div class="modern-progress-fill" id="modern-progress-fill"></div>
            </div>
            <div class="modern-progress-details">
              <span><i class="fas fa-check"></i> <span id="modern-copied-count">0</span> videos copied</span>
              <span><i class="fas fa-clock"></i> <span id="modern-time-remaining">calculating...</span></span>
            </div>
          </div>
        </div>
        
        <!-- Modal Actions -->
        <div class="modern-modal-actions">
          <button class="modern-cancel-btn" id="modern-cancel-copy-btn">
            Cancel
          </button>
          <button id="modern-confirm-copy-btn" class="modern-confirm-btn" disabled>
            <i class="fas fa-copy"></i>Copy Videos
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  const spinner = document.getElementById('modern-loading-spinner');
  const optionsSection = document.querySelector('.modern-selection-options');
  
  try {
    await loadUserCopiedPlaylists();
    spinner.style.display = 'none';
    optionsSection.style.display = 'block';
    
    if (playlistState.userPlaylists.length === 0) {
      document.getElementById('modern-playlists-list').style.display = 'none';
      document.getElementById('modern-no-playlists').style.display = 'block';
      document.getElementById('modern-new-playlist-radio').checked = true;
      document.getElementById('modern-new-playlist-form').style.display = 'block';
      updateModernConfirmButton();
    } else {
      renderModernPlaylistOptions();
    }
  } catch (error) {
    const safeErrorMessage = sanitize.escapeHtml(error.message || 'Please check your connection');
    spinner.innerHTML = `
      <div class="modern-error-state">
        <i class="fas fa-exclamation-triangle modern-error-icon"></i>
        <h4>Failed to Load Playlists</h4>
        <div class="modern-error-details">${safeErrorMessage}</div>
        <button class="modern-retry-btn" id="modern-retry-load-btn">
          <i class="fas fa-sync-alt"></i> Try Again
        </button>
      </div>
    `;
    document.getElementById('modern-retry-load-btn').addEventListener('click', modernRetryLoadPlaylists);
    console.error('Error loading playlists:', error);
  }
  
  // Event listeners
  setupModernModalEvents();
}

function renderModernPlaylistOptions() {
  const container = document.getElementById('modern-playlists-list');
  
  if (playlistState.userPlaylists.length === 0) {
    container.innerHTML = '';
    document.getElementById('modern-no-playlists').style.display = 'block';
    return;
  }
  
  document.getElementById('modern-no-playlists').style.display = 'none';
  
  container.innerHTML = playlistState.userPlaylists.map(playlist => `
    <div class="modern-playlist-option">
      <input type="radio" name="modern-target-playlist" id="modern-playlist-${sanitize.escapeHtml(playlist.id)}" value="${sanitize.escapeHtml(playlist.id)}">
      <label for="modern-playlist-${sanitize.escapeHtml(playlist.id)}" class="modern-radio-label">
        <div class="playlist-option-icon">
          <i class="fas fa-list-ul"></i>
        </div>
        <div class="modern-playlist-info">
          <span class="modern-playlist-name">${sanitize.escapeHtml(playlist.name)}</span>
          <div class="modern-playlist-meta">
            <span class="meta-item">
              <i class="fas fa-music"></i>${playlist.videoCount || 0} videos
            </span>
            <span class="visibility-badge ${playlist.visibility}">${sanitize.escapeHtml(playlist.visibility)}</span>
          </div>
          ${playlist.description ? `<div class="modern-playlist-description">${sanitize.escapeHtml(playlist.description)}</div>` : ''}
        </div>
      </label>
    </div>
  `).join('');
}

function setupModernModalEvents() {
  // Close modal
  document.querySelector('.modern-copy-modal .modal-close').addEventListener('click', closeModal);
  document.getElementById('modern-cancel-copy-btn').addEventListener('click', closeModal);
  
  // Create first playlist button
  document.getElementById('modern-create-first-btn')?.addEventListener('click', () => {
    document.getElementById('modern-new-playlist-radio').checked = true;
    document.getElementById('modern-new-playlist-form').style.display = 'block';
    updateModernConfirmButton();
    document.getElementById('modern-playlist-name').focus();
  });
  
  // New playlist radio change
  document.getElementById('modern-new-playlist-radio').addEventListener('change', (e) => {
    const form = document.getElementById('modern-new-playlist-form');
    form.style.display = e.target.checked ? 'block' : 'none';
    updateModernConfirmButton();
    if (e.target.checked) {
      document.getElementById('modern-playlist-name').focus();
    }
  });
  
  // Playlist selection change
  document.addEventListener('change', (e) => {
    if (e.target.name === 'modern-target-playlist') {
      updateModernConfirmButton();
    }
  });
  
  // Name validation
  document.getElementById('modern-playlist-name')?.addEventListener('input', async (e) => {
    const name = sanitize.sanitizeText(e.target.value);
    const errorElement = document.getElementById('modern-name-error');
    
    if (!name) {
      errorElement.textContent = 'Playlist name is required';
      updateModernConfirmButton();
      return;
    }
    
    if (name.length > 100) {
      errorElement.textContent = 'Name must be less than 100 characters';
      updateModernConfirmButton();
      return;
    }
    
    const isUnique = await isPlaylistNameUnique(name);
    if (!isUnique) {
      errorElement.textContent = 'You already have a playlist with this name';
      updateModernConfirmButton();
      return;
    }
    
    errorElement.textContent = '';
    updateModernConfirmButton();
  });
  
  // Confirm copy - WITH DEBOUNCE
  const confirmBtn = document.getElementById('modern-confirm-copy-btn');
  confirmBtn.addEventListener('click', handleModernCopyConfirmation);
}

function updateModernConfirmButton() {
  const confirmBtn = document.getElementById('modern-confirm-copy-btn');
  const selectedOption = document.querySelector('input[name="modern-target-playlist"]:checked');
  
  if (!selectedOption) {
    confirmBtn.disabled = true;
    return;
  }
  
  if (selectedOption.value === 'new') {
    const name = sanitize.sanitizeText(document.getElementById('modern-playlist-name').value);
    const error = document.getElementById('modern-name-error').textContent;
    confirmBtn.disabled = !name || error;
  } else {
    confirmBtn.disabled = false;
  }
}

async function handleModernCopyConfirmation() {
  // Prevent multiple simultaneous copies
  if (isCopyInProgress) {
    showCustomAlert('Copy operation already in progress...', 'warning');
    return;
  }

  const selectedOption = document.querySelector('input[name="modern-target-playlist"]:checked');
  
  if (!selectedOption) {
    showCustomAlert('Please select a destination playlist', 'warning');
    return;
  }

  // Disable button immediately to prevent multiple clicks
  const confirmBtn = document.getElementById('modern-confirm-copy-btn');
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Copying...';
  isCopyInProgress = true;

  try {
    const progressContainer = document.getElementById('modern-progress-container');
    const progressFill = document.getElementById('modern-progress-fill');
    const progressText = document.getElementById('modern-progress-text');
    const progressPercentage = document.getElementById('modern-progress-percentage');
    const copiedCountElement = document.getElementById('modern-copied-count');
    
    document.querySelector('.modern-selection-options').style.display = 'none';
    progressContainer.style.display = 'block';
    
    let result;
    const totalVideos = playlistState.playlistVideos.length;
    
    if (selectedOption.value === 'new') {
      const name = sanitize.sanitizeText(document.getElementById('modern-playlist-name').value);
      const description = sanitize.sanitizeText(document.getElementById('modern-playlist-description').value);
      const visibility = document.querySelector('input[name="modern-visibility"]:checked').value;
      
      progressText.textContent = 'Creating new playlist...';
      updateProgress(0, totalVideos, progressFill, progressPercentage, copiedCountElement);
      
      // Create playlist first
      result = await copyPlaylistToSharedCollection(name, description, visibility);
      
      showCustomAlert(`Created new playlist "${name}" with ${result.addedCount} videos`, 'success');
    } else {
      const playlistId = selectedOption.value;
      const playlist = playlistState.userPlaylists.find(p => p.id === playlistId);
      const playlistName = playlist?.name || 'the playlist';
      
      progressText.textContent = `Adding videos to "${playlistName}"...`;
      updateProgress(0, totalVideos, progressFill, progressPercentage, copiedCountElement);
      
      const addedCount = await addToExistingPlaylist(playlistId);
      
      showCustomAlert(`Added ${addedCount} videos to "${playlistName}"`, 'success');
    }
    
    // Close modal after successful copy
    setTimeout(() => {
      closeModal();
      isCopyInProgress = false;
    }, 1000);
    
  } catch (error) {
    console.error('Copy failed:', error);
    showCustomAlert(error.message || 'Failed to copy playlist. Please try again.', 'error', 5000);
    
    // Re-enable button on error
    const confirmBtn = document.getElementById('modern-confirm-copy-btn');
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '<i class="fas fa-copy"></i>Copy Videos';
    isCopyInProgress = false;
  }
}

function updateProgress(current, total, progressFill, progressPercentage, copiedCountElement) {
  const percent = Math.round((current / total) * 100);
  progressFill.style.width = `${percent}%`;
  progressPercentage.textContent = `${percent}%`;
  copiedCountElement.textContent = current;
}

function modernRetryLoadPlaylists() {
  const spinner = document.getElementById('modern-loading-spinner');
  if (spinner) {
    spinner.innerHTML = '<div class="modern-spinner"></div><p class="modern-loading-text">Loading your playlists...</p>';
    setTimeout(() => showPlaylistSelectionModal(), 300);
  }
}


// Update the initCopyPlaylistButton to use the new modal
async function initCopyPlaylistButton() {
  const btn = document.getElementById('copy-playlist-btn');
  if (!btn) return;
  
  btn.addEventListener('click', async () => {
    if (!auth.currentUser) {
      showAuthRequired('playlist', 'copy_playlist');
      return;
    }
    
    if (!playlistState.currentPlaylistId || playlistState.playlistVideos.length === 0) {
      showCustomAlert('There are no videos in this playlist to copy', 'error');
      return;
    }
    
    await showPlaylistSelectionModal();
  });
}
// Subscription Functions
async function checkSubscriptionStatus(channelId) {
  const user = auth.currentUser;
  if (!user) return false;
  
  try {
    const subRef = doc(db, 'users', user.uid, 'subscriptions', channelId);
    const subDoc = await getDoc(subRef);
    return subDoc.exists();
  } catch (error) {
    console.error('Error checking subscription:', error);
    return false;
  }
}

async function toggleSubscription() {
  const user = auth.currentUser;
  if (!user) {
   showAuthRequired('subscribe');   
    return;
  }
  
  const channelId = sanitize.sanitizeText(playlistState.channelInfo.id);
  if (!channelId) return;
  
  const btn = document.getElementById('subscribe-btn');
  if (!btn) return;
  
  try {
    const isSubscribed = await checkSubscriptionStatus(channelId);
    
    if (isSubscribed) {
      await deleteDoc(doc(db, 'users', user.uid, 'subscriptions', channelId));
      updateSubscribeButton(btn, false);
      console.log('Unsubscribed from channel:', channelId);
    } else {
      await setDoc(doc(db, 'users', user.uid, 'subscriptions', channelId), {
        channelId: channelId,
        channelName: sanitize.escapeHtml(playlistState.channelInfo.name),
        channelLogo: sanitize.sanitizeUrl(document.getElementById('channel-logo').src),
        subscribedAt: new Date().toISOString()
      });
      updateSubscribeButton(btn, true);
      console.log('Subscribed to channel:', channelId);
    }
  } catch (error) {
    console.error('Error toggling subscription:', error);
    showCustomAlert('Failed to update subscription. Please try again.', 'error');
  }
}

function updateSubscribeButton(btn, isSubscribed) {
  if (isSubscribed) {
    btn.innerHTML = '<i class="fas fa-bell-slash"></i> ';
    btn.classList.add('subscribed');
  } else {
    btn.innerHTML = '<i class="fas fa-bell"></i> ';
    btn.classList.remove('subscribed');
  }
}

// Check if video is favorited
async function checkFavoriteStatus(videoId) {
    const safeVideoId = sanitize.sanitizeText(videoId);
    const user = auth.currentUser;
    if (!user) return false;
    
    try {
        const favRef = doc(db, 'users', user.uid, 'favorites', safeVideoId);
        const favDoc = await getDoc(favRef);
        return favDoc.exists();
    } catch (error) {
        console.error('Error checking favorite:', error);
        return false;
    }
}

// Toggle favorite status
async function toggleFavorite(videoId) {
    const safeVideoId = sanitize.sanitizeText(videoId);
    const user = auth.currentUser;
    if (!user) {
      showAuthRequired('favorite', 'favorite');
        return;
    }
    
    const btn = document.getElementById('favorite-btn');
    if (!btn) return;
    
    try {
        const isFavorited = await checkFavoriteStatus(safeVideoId);
        
        if (isFavorited) {
            await deleteDoc(doc(db, 'users', user.uid, 'favorites', safeVideoId));
            updateFavoriteButton(btn, false);
            console.log('Removed from favorites:', safeVideoId);
        } else {
            const currentVideo = playlistState.playlistVideos[playlistState.currentVideoIndex];
            await setDoc(doc(db, 'users', user.uid, 'favorites', safeVideoId), {
                videoId: safeVideoId,
                title: sanitize.escapeHtml(currentVideo.title),
                thumbnail: sanitize.sanitizeUrl(currentVideo.thumbnail),
                channel: sanitize.escapeHtml(currentVideo.channel),
                addedAt: new Date().toISOString()
            });
            updateFavoriteButton(btn, true);
            console.log('Added to favorites:', safeVideoId);
        }
    } catch (error) {
        console.error('Error toggling favorite:', error);
        showCustomAlert('Failed to update favorites. Please try again.', 'error');
    }
}

// Update favorite button UI
function updateFavoriteButton(btn, isFavorited) {
    if (isFavorited) {
        btn.innerHTML = '<i class="fas fa-heart"></i>';
        btn.classList.add('favorited');
    } else {
        btn.innerHTML = '<i class="far fa-heart"></i>';
        btn.classList.remove('favorited');
    }
}
// NEW: Enhanced favorite system with global tracking (COMPLETELY ISOLATED)
async function toggleFavoriteEnhanced(videoId) {
  const safeVideoId = sanitize.sanitizeText(videoId);
  const user = auth.currentUser;
  
  if (!user) {
    showAuthRequired('favorite', 'favorite');
    return;
  }
  
  const btn = document.getElementById('favorite-btn');
  if (!btn) return;
  
  try {
    // Use existing checkFavoriteStatus function (NO CHANGE)
    const isFavorited = await checkFavoriteStatus(safeVideoId);
    
    if (isFavorited) {
      await removeFromFavoritesEnhanced(safeVideoId, user);
      updateFavoriteButton(btn, false); // Use existing function
      console.log('Removed from favorites:', safeVideoId);
      showCustomAlert('Removed from favorites', 'success');
    } else {
      await addToFavoritesEnhanced(safeVideoId, user);
      updateFavoriteButton(btn, true); // Use existing function
      console.log('Added to favorites:', safeVideoId);
      showCustomAlert('Added to favorites', 'success');
    }
  } catch (error) {
    console.error('Error toggling favorite:', error);
    showCustomAlert('Failed to update favorites. Please try again.', 'error');
  }
}

// NEW: Check if video exists in shared collection
async function videoExistsInSharedCollection(videoId) {
  try {
    const videoRef = doc(db, 'sharedVideos', videoId);
    const videoDoc = await getDoc(videoRef);
    return videoDoc.exists();
  } catch (error) {
    console.error('Error checking video in shared collection:', error);
    return false;
  }
}

// NEW: Enhanced add to favorites (separate from existing system)
// NEW: Enhanced favorite system with MANUAL counting (no increment needed)
async function addToFavoritesEnhanced(videoId, user) {
  const currentVideo = playlistState.playlistVideos[playlistState.currentVideoIndex];
  
  // Step 1: Use existing user favorites (NO CHANGE to user data structure)
  const userFavRef = doc(db, 'users', user.uid, 'favorites', videoId);
  await setDoc(userFavRef, {
    videoId: videoId,
    title: sanitize.escapeHtml(currentVideo.title),
    thumbnail: sanitize.sanitizeUrl(currentVideo.thumbnail),
    channel: sanitize.escapeHtml(currentVideo.channel),
    addedAt: new Date().toISOString()
  });
  
  // Step 2: NEW - Global tracking (separate system)
  try {
    const videoExists = await videoExistsInSharedCollection(videoId);
    
    if (!videoExists) {
      // Create shared video entry
      await setDoc(doc(db, 'sharedVideos', videoId), {
        videoId: videoId,
        title: sanitize.escapeHtml(currentVideo.title),
        thumbnail: sanitize.sanitizeUrl(currentVideo.thumbnail),
        channel: sanitize.escapeHtml(currentVideo.channel),
        description: sanitize.escapeHtml(currentVideo.description) || '',
        duration: currentVideo.duration || 0,
        favoriteCount: 1,
        firstFavoritedAt: new Date().toISOString(),
        lastFavoritedAt: new Date().toISOString(),
        cachedAt: new Date().toISOString()
      });
    } else {
      // MANUAL INCREMENT: Get current count and add 1
      const videoRef = doc(db, 'sharedVideos', videoId);
      const videoDoc = await getDoc(videoRef);
      const currentCount = videoDoc.data()?.favoriteCount || 0;
      
      await updateDoc(videoRef, {
        favoriteCount: currentCount + 1,
        lastFavoritedAt: new Date().toISOString()
      });
    }
    
    // Add to favorites subcollection
    const globalFavRef = doc(db, 'sharedVideos', videoId, 'favorites', user.uid);
    await setDoc(globalFavRef, {
      userId: user.uid,
      userEmail: user.email || '',
      userName: user.displayName || 'Anonymous',
      favoritedAt: new Date().toISOString(),
      action: 'added'
    });
    
  } catch (error) {
    console.error('Error in global favorite tracking:', error);
    // DON'T THROW ERROR - continue with user favorite even if global fails
  }
}

// NEW: Enhanced remove from favorites with MANUAL counting
async function removeFromFavoritesEnhanced(videoId, user) {
  // Step 1: Use existing user favorites removal (NO CHANGE)
  const userFavRef = doc(db, 'users', user.uid, 'favorites', videoId);
  await deleteDoc(userFavRef);
  
  // Step 2: NEW - Global tracking (separate system)
  try {
    // MANUAL DECREMENT: Get current count and subtract 1
    const videoRef = doc(db, 'sharedVideos', videoId);
    const videoDoc = await getDoc(videoRef);
    const currentCount = videoDoc.data()?.favoriteCount || 1;
    
    await updateDoc(videoRef, {
      favoriteCount: Math.max(0, currentCount - 1), // Don't go below 0
      lastFavoritedAt: new Date().toISOString()
    });
    
    // Add removal record
    const globalFavRef = doc(db, 'sharedVideos', videoId, 'favorites', user.uid);
    await setDoc(globalFavRef, {
      userId: user.uid,
      userEmail: user.email || '',
      userName: user.displayName || 'Anonymous',
      removedAt: new Date().toISOString(),
      action: 'removed'
    });
    
  } catch (error) {
    console.error('Error in global favorite tracking:', error);
    // DON'T THROW ERROR - continue with user favorite even if global fails
  }
}
function isLastVideo() {
  return playlistState.currentVideoIndex >= playlistState.playlistVideos.length - 1;
}

function isFirstVideo() {
  return playlistState.currentVideoIndex <= 0;
}

// Check if playlist is saved
async function checkPlaylistSavedStatus(playlistId) {
  const safePlaylistId = sanitize.sanitizeText(playlistId);
  const user = auth.currentUser;
  if (!user) return false;
  
  try {
    const savedRef = doc(db, 'users', user.uid, 'savedPlaylists', safePlaylistId);
    const savedDoc = await getDoc(savedRef);
    return savedDoc.exists();
  } catch (error) {
    console.error('Error checking saved playlist:', error);
    return false;
  }
}

// Toggle playlist saved status
async function toggleSavePlaylist() {
  const user = auth.currentUser;
  if (!user) {
    showAuthRequired('playlist');
    return;
  }
  
  const playlistId = sanitize.sanitizeText(playlistState.currentPlaylistId);
  if (!playlistId) return;
  
  const btn = document.getElementById('save-playlist-btn');
  if (!btn) return;
  
  try {
    const isSaved = await checkPlaylistSavedStatus(playlistId);
    
    if (isSaved) {
      await deleteDoc(doc(db, 'users', user.uid, 'savedPlaylists', playlistId));
      updateSavePlaylistButton(btn, false);
      console.log('Removed from saved playlists:', playlistId);
    } else {
      await setDoc(doc(db, 'users', user.uid, 'savedPlaylists', playlistId), {
        playlistId: playlistId,
        title: sanitize.escapeHtml(document.getElementById('playlist-title-expanded').textContent),
        channel: sanitize.escapeHtml(playlistState.channelInfo.name),
        thumbnail: sanitize.sanitizeUrl(playlistState.playlistVideos[0]?.thumbnail) || '',
        savedAt: new Date().toISOString()
      });
      updateSavePlaylistButton(btn, true);
      console.log('Added to saved playlists:', playlistId);
    }
  } catch (error) {
    console.error('Error toggling saved playlist:', error);
    showCustomAlert('Failed to update saved playlists. Please try again.', 'error');
  }
}

// Update save playlist button UI
function updateSavePlaylistButton(btn, isSaved) {
  if (isSaved) {
    btn.innerHTML = '<i class="fas fa-bookmark"></i> ';
    btn.classList.add('saved');
  } else {
    btn.innerHTML = '<i class="far fa-bookmark"></i> ';
    btn.classList.remove('saved');
  }
}

// Initialize save playlist button
async function initSavePlaylistButton() {
  const btn = document.getElementById('save-playlist-btn');
  if (!btn) return;
  
  btn.addEventListener('click', toggleSavePlaylist);
  
  if (auth.currentUser && playlistState.currentPlaylistId) {
    const isSaved = await checkPlaylistSavedStatus(playlistState.currentPlaylistId);
    updateSavePlaylistButton(btn, isSaved);
  }
}

// Share Modal Functions
function showShareModal(contentType, id, title, description, shareText) {
  const safeType = contentType === 'video' ? 'video' : 'playlist';
  const safeId = sanitize.sanitizeText(id);
  const safeTitle = sanitize.escapeHtml(title);
  const safeDesc = sanitize.escapeHtml(description);
  const safeShareText = sanitize.escapeHtml(shareText);
  
  const url = safeType === 'video' 
    ? getVideoShareUrl(safeId)
    : getPlaylistShareUrl(safeId);

  const shortDesc = safeDesc.length > 30 
    ? `${safeDesc.substring(0, 30)}...` 
    : safeDesc;

  const modalHTML = `
    <div class="modal-overlay active">
      <div class="modal-content share-modal">
        <div class="modal-header">
          <h3><i class="fas fa-share-alt"></i> Share ${safeType === 'video' ? 'Video' : 'Playlist'}</h3>
          <button class="modal-close"><i class="fas fa-times"></i></button>
        </div>
        
        <div class="share-preview">
          <div class="share-preview-icon">
            <i class="fas fa-${safeType === 'video' ? 'play' : 'list-ul'}"></i>
          </div>
          <div class="share-preview-content">
            <h4>${safeTitle}</h4>
            <p>${shortDesc}</p>
          </div>
        </div>
        
        <div class="share-url-section">
          <label class="share-url-label">SHARE LINK</label>
          <div class="share-url-container">
            <input type="text" class="share-url-input" value="${url}" readonly>
            <button class="copy-url-btn">
              <i class="fas fa-copy"></i>
            </button>
          </div>
          <div class="copy-status" id="copy-status">
            <i class="fas fa-check"></i> Copied!
          </div>
        </div>
        
        <div class="share-options-section">
          <div class="share-options-title">SHARE VIA</div>
          <div class="share-options-grid">
            <button class="share-option" data-platform="whatsapp">
              <i class="fab fa-whatsapp"></i>
              <span class="share-option-label">WhatsApp</span>
            </button>
            <button class="share-option" data-platform="facebook">
              <i class="fab fa-facebook-f"></i>
              <span class="share-option-label">FB</span>
            </button>
            <button class="share-option" data-platform="twitter">
              <i class="fab fa-twitter"></i>
              <span class="share-option-label">Twitter</span>
            </button>
            <button class="share-option" data-platform="telegram">
              <i class="fab fa-telegram-plane"></i>
              <span class="share-option-label">Telegram</span>
            </button>
            <button class="share-option" data-platform="reddit">
              <i class="fab fa-reddit-alien"></i>
              <span class="share-option-label">Reddit</span>
            </button>
            <button class="share-option" data-platform="messenger">
              <i class="fab fa-facebook-messenger"></i>
              <span class="share-option-label">Msg</span>
            </button>
            <button class="share-more-option" id="share-more-option">
              <i class="fas fa-ellipsis-h"></i>
              <span class="share-option-label">More</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);

  // Event listeners
  document.querySelector('.modal-close').addEventListener('click', closeModal);
  
  const copyBtn = document.querySelector('.copy-url-btn');
  const copyStatus = document.getElementById('copy-status');
  
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(url).then(() => {
      copyStatus.classList.add('show');
      setTimeout(() => copyStatus.classList.remove('show'), 2000);
    });
  });

  // Platform sharing
  document.querySelectorAll('.share-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const platform = btn.dataset.platform;
      let shareUrl = '';
      const encodedUrl = encodeURIComponent(url);
      const encodedTitle = encodeURIComponent(`${safeTitle} - ${safeDesc}`);
      
      switch(platform) {
        case 'whatsapp': shareUrl = `https://wa.me/?text=${encodedTitle}%0A${encodedUrl}`; break;
        case 'facebook': shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedTitle}`; break;
        case 'twitter': shareUrl = `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`; break;
        case 'telegram': shareUrl = `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`; break;
        case 'reddit': shareUrl = `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`; break;
        case 'messenger': shareUrl = `fb-messenger://share/?link=${encodedUrl}`; break;
      }
      
      if (shareUrl) window.open(shareUrl, '_blank', 'noopener,noreferrer');
    });
  });

  // Native sharing
  document.getElementById('share-more-option')?.addEventListener('click', () => {
    if (navigator.share) {
      navigator.share({
        title: safeTitle,
        text: safeShareText,
        url: url
      }).catch(err => {
        console.log('Error sharing:', err);
      });
    } else {
      window.open(url, '_blank');
    }
  });
}

// Initialize Share Buttons
function initShareButtons() {
  document.getElementById('share-video-btn')?.addEventListener('click', () => {
    if (!playlistState.playlistVideos.length || playlistState.currentVideoIndex === null) {
      showCustomAlert('No video is currently playing', 'error');
      return;
    }
    
    const currentVideo = playlistState.playlistVideos[playlistState.currentVideoIndex];
    showShareModal(
      'video',
      currentVideo.videoId,
      currentVideo.title,
      `Video from ${currentVideo.channel}`,
      `Check out this video: ${currentVideo.title}`
    );
  });

  document.getElementById('share-playlist-btn')?.addEventListener('click', () => {
    if (!playlistState.currentPlaylistId) {
      showCustomAlert('No playlist loaded', 'error');
      return;
    }
    
    const playlistTitle = document.getElementById('playlist-title-expanded').textContent;
    const playlistCount = playlistState.playlistVideos.length;
    showShareModal(
      'playlist',
      playlistState.currentPlaylistId,
      playlistTitle,
      `${playlistCount} ${playlistCount === 1 ? 'song' : 'songs'}`,
      `Check out this playlist: ${playlistTitle}`
    );
  });
}

// Utility Functions
function updateMediaSessionMetadata() {
  if (!('mediaSession' in navigator)) return;

  const currentVideo = playlistState.playlistVideos[playlistState.currentVideoIndex];
  if (!currentVideo) return;

  const artwork = currentVideo.thumbnail ? 
    [{ src: currentVideo.thumbnail, sizes: '192x192', type: 'image/jpeg' }] : 
    [];
  
  navigator.mediaSession.metadata = new MediaMetadata({
    title: currentVideo.title || "Untitled Video",
    artist: currentVideo.channel || "Unknown Channel",
    artwork: artwork
  });
}

function updateMediaSessionPlaybackState() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.playbackState = playlistState.isPlaying ? 'playing' : 'paused';
}

function setupMediaControls() {
  if (!('mediaSession' in navigator)) {
    console.log('MediaSession API not supported');
    return;
  }

  navigator.mediaSession.setActionHandler('play', null);
  navigator.mediaSession.setActionHandler('pause', null);
  navigator.mediaSession.setActionHandler('nexttrack', null);
  navigator.mediaSession.setActionHandler('previoustrack', null);

  navigator.mediaSession.setActionHandler('play', () => {
    if (playlistState.player && !playlistState.isPlaying) {
      playlistState.player.playVideo();
      playlistState.isPlaying = true;
      updatePlayPauseButton();
      updateMiniPlayPauseButton();
      updateMediaSessionPlaybackState();
    }
  });

  navigator.mediaSession.setActionHandler('pause', () => {
    if (playlistState.player && playlistState.isPlaying) {
      playlistState.player.pauseVideo();
      playlistState.isPlaying = false;
      updatePlayPauseButton();
      updateMiniPlayPauseButton();
      updateMediaSessionPlaybackState();
    }
  });

  navigator.mediaSession.setActionHandler('nexttrack', () => {
    if (!isLastVideo()) {
      playNextVideo();
      updateMediaSessionPlaybackState();
    }
  });

  navigator.mediaSession.setActionHandler('previoustrack', () => {
    if (!isFirstVideo()) {
      playPreviousVideo();
      updateMediaSessionPlaybackState();
    }
  });

  console.log('Media controls initialized');
}

function getVideoShareUrl(videoId) {
  const safeVideoId = sanitize.sanitizeText(videoId);
  return `${window.location.origin}/video.html?v=${safeVideoId}`;
}

function getPlaylistShareUrl(playlistId) {
  const safePlaylistId = sanitize.sanitizeText(playlistId);
  return `${window.location.origin}/playlist.html?list=${safePlaylistId}`;
}

function closeModal() {
  const modal = document.querySelector('.modal-overlay');
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => modal.remove(), 300);
  }
}

// Enhanced description formatting function
function formatDescription(text) {
  if (!text) return 'No description available';
  
  // Preserve line breaks and basic formatting
  let formattedText = sanitize.escapeHtml(text);
  
  // Convert URLs to clickable links
  formattedText = formattedText.replace(/(https?:\/\/[^\s]+)/g, (url) => {
    const cleanUrl = url.replace(/[.,!?;:]$/, ''); // Remove trailing punctuation
    const domain = new URL(cleanUrl).hostname;
    
    // Social media icons
    const socialIcons = {
      'instagram.com': 'fab fa-instagram',
      'twitter.com': 'fab fa-twitter',
      'x.com': 'fab fa-twitter',
      'facebook.com': 'fab fa-facebook',
      'youtube.com': 'fab fa-youtube',
      'tiktok.com': 'fab fa-tiktok',
      'spotify.com': 'fab fa-spotify',
      'soundcloud.com': 'fab fa-soundcloud',
      'discord.gg': 'fab fa-discord',
      'reddit.com': 'fab fa-reddit',
      'twitch.tv': 'fab fa-twitch',
      'linkedin.com': 'fab fa-linkedin'
    };
    
    const icon = socialIcons[domain] || 'fas fa-external-link-alt';
    
    return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="social-link">
                  <i class="${icon} social-icon"></i>${cleanUrl}
                </a>`;
  });
  
  // Highlight hashtags - COLOR ONLY
  formattedText = formattedText.replace(/#(\w+)/g, '<span class="description-highlight">#$1</span>');
  
  // Make timestamps clickable (format: 1:23, 01:23, 1:23:45) - COLOR ONLY
  formattedText = formattedText.replace(/(\b\d{1,2}:\d{2}(?::\d{2})?\b)/g, (timestamp) => {
    const seconds = convertTimestampToSeconds(timestamp);
    return `<span class="description-timestamp" data-timestamp="${seconds}">${timestamp}</span>`;
  });
  
  // Make @mentions clickable - COLOR ONLY
  formattedText = formattedText.replace(/@(\w+)/g, '<span class="description-mention" data-mention="$1">@$1</span>');
  
  return formattedText;
}

// Convert timestamp to seconds
function convertTimestampToSeconds(timestamp) {
  const parts = timestamp.split(':').map(part => parseInt(part, 10));
  
  if (parts.length === 2) {
    // MM:SS format
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // HH:MM:SS format
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  
  return 0;
}

// Add event listeners for interactive elements in description
function addDescriptionEventListeners(container) {
  // Timestamp click handlers
  container.querySelectorAll('.description-timestamp').forEach(element => {
    element.addEventListener('click', (e) => {
      e.preventDefault();
      const timestamp = parseInt(element.dataset.timestamp, 10);
      if (playlistState.player && timestamp > 0) {
        playlistState.player.seekTo(timestamp, true);
        
        // Show feedback
        showCustomAlert(`Jumping to ${formatSecondsToTimestamp(timestamp)}`, 'info', 2000);
      }
    });
  });
  
  // Mention click handlers
  container.querySelectorAll('.description-mention').forEach(element => {
    element.addEventListener('click', (e) => {
      e.preventDefault();
      const mention = element.dataset.mention;
      if (mention) {
        // Navigate to channel page
        window.location.href = `/channel.html?id=@${mention}`;
      }
    });
  });
  
  // Social link handlers (already handled by target="_blank")
}

// Helper function to format seconds back to timestamp
function formatSecondsToTimestamp(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

// Mini Player Functions
function initMiniPlayer() {
  const miniPlayer = document.getElementById('mini-player');
  if (!miniPlayer) return;
  
  // Add click handler to scroll to top when tapping on mini player (but not controls)
  miniPlayer.addEventListener('click', (e) => {
    // Only scroll if the click wasn't on a control button
    if (!e.target.closest('.mini-control-btn')) {
      scrollToPlayerSection();
    }
  });
  
  // Initialize mini player controls
  initMiniPlayerControls();
  
  // Set up intersection observer to detect when player section leaves viewport
  setupPlayerVisibilityObserver();
  
  // Set up scroll event listener for additional control
  window.addEventListener('scroll', handleScrollForMiniPlayer);

  // Also check on video play for any visibility updates
  const originalPlayVideo = playVideoFromPlaylist;
  playVideoFromPlaylist = function(index) {
    originalPlayVideo.call(this, index);
    setTimeout(updateMiniPlayerVisibility, 100);
  };
  
  // Initialize marquee resize handler
  window.addEventListener('resize', handleMarqueeResize);
}
  
 // Seamless Marquee Functions
function createSeamlessMarquee(titleText, container) {
  // Clear existing content
  container.innerHTML = '';
  
  const wrapper = document.createElement('div');
  wrapper.className = 'mini-title-wrapper';
  
  // Create original title
  const originalTitle = document.createElement('span');
  originalTitle.className = 'mini-video-title';
  originalTitle.textContent = titleText;
  
  // Create duplicate title for seamless looping
  const duplicateTitle = document.createElement('span');
  duplicateTitle.className = 'mini-video-title duplicate';
  duplicateTitle.textContent = titleText;
  
  // Add both to wrapper
  wrapper.appendChild(originalTitle);
  wrapper.appendChild(duplicateTitle);
  
  // Add to container
  container.appendChild(wrapper);
  
  // Adjust animation speed based on text length
  adjustMarqueeSpeed(wrapper, titleText);
  
  return wrapper;
}

function adjustMarqueeSpeed(wrapper, titleText) {
  // Remove existing speed classes
  wrapper.classList.remove('long-text', 'very-long-text');
  
  // Calculate text length and adjust animation speed
  const textLength = titleText.length;
  
  if (textLength > 60) {
    wrapper.classList.add('very-long-text');
  } else if (textLength > 40) {
    wrapper.classList.add('long-text');
  }
}

function updateMiniPlayerTitle(title) {
  const titleContainer = document.querySelector('.mini-title-container');
  if (!titleContainer) return;
  
  const safeTitle = sanitize.escapeHtml(title) || 'Unknown Title';
  
  // Create seamless marquee
  const marqueeWrapper = createSeamlessMarquee(safeTitle, titleContainer);
  
  // Set animation state based on player state
  if (!playlistState.isPlaying) {
    marqueeWrapper.classList.add('paused');
  } else {
    marqueeWrapper.classList.remove('paused');
  }
} 
function setupPlayerVisibilityObserver() {
  const playerSection = document.querySelector('.player-section');
  if (!playerSection) return;
  
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        // Use a more sensitive threshold for better detection
        playlistState.isPlayerInView = entry.isIntersecting &&
          entry.intersectionRatio > 0.2; // 20% visibility threshold
        
        updateMiniPlayerVisibility();
      });
    },
    {
      threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5],
      rootMargin: '0px 0px -80px 0px' // Reduced margin for earlier detection
    }
  );
  
  observer.observe(playerSection);
  
  // Enhanced scroll handling
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(updateMiniPlayerVisibility, 50);
  });
  
  // Check initially
  setTimeout(updateMiniPlayerVisibility, 100);
}

// Update the existing scroll handler
function handleScrollForMiniPlayer() {
  updateMiniPlayerVisibility();
}

function updateMiniPlayerVisibility() {
  const miniPlayer = document.getElementById('mini-player');
  const playerSection = document.querySelector('.player-section');
  const playlistContent = document.querySelector('.playlist-content');
  const bottomNav = document.querySelector('.bottom-nav');
  
  if (!playerSection || !miniPlayer || !playlistContent || !bottomNav) return;
  
  const playerRect = playerSection.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  
  // More precise player visibility calculation
  const playerTop = playerRect.top;
  const playerBottom = playerRect.bottom;
  const playerHeight = playerRect.height;
  
  // Player is considered "in view" if most of it is visible
  const visibleThreshold = playerHeight * 0.3; // 30% of player height
  const isPlayerVisible = playerTop >= -visibleThreshold &&
    playerBottom <= (viewportHeight + visibleThreshold);
  
  const shouldShow = !isPlayerVisible && playlistState.playlistVideos.length > 0;
  
  if (shouldShow && !playlistState.miniPlayerVisible) {
    showMiniPlayer();
  } else if (!shouldShow && playlistState.miniPlayerVisible) {
    hideMiniPlayer();
  }
}

// Enhanced Mini Player with Bottom Nav Control
function showMiniPlayer() {
  const miniPlayer = document.getElementById('mini-player');
  const bottomNav = document.querySelector('.bottom-nav');
  
  playlistState.miniPlayerVisible = true;
  
  miniPlayer.classList.add('visible');
  document.body.classList.add('mini-player-visible');
  
  // Hide bottom nav with smooth transition
  if (bottomNav) {
    bottomNav.classList.add('hidden');
    // Disable pointer events
    bottomNav.style.pointerEvents = 'none';
  }
  
  updateMiniPlayerContent();
  
  // Start progress tracking if player is playing
  if (playlistState.isPlaying) {
    startProgressTracking();
  }
  
  console.log('🎵 Mini player shown, bottom nav hidden');
}

function hideMiniPlayer() {
  const miniPlayer = document.getElementById('mini-player');
  const bottomNav = document.querySelector('.bottom-nav');
  
  playlistState.miniPlayerVisible = false;
  
  miniPlayer.classList.remove('visible');
  document.body.classList.remove('mini-player-visible');
  miniPlayer.classList.remove('playing');
  
  // Show bottom nav with smooth transition
  if (bottomNav) {
    bottomNav.classList.remove('hidden');
    // Re-enable pointer events
    bottomNav.style.pointerEvents = 'auto';
  }
  
  // Stop progress tracking
  stopProgressTracking();
  
  console.log('🎵 Mini player hidden, bottom nav shown');
}


function updateMiniPlayerContent() {
  if (!playlistState.miniPlayerVisible) return;
  
  const currentVideo = playlistState.playlistVideos[playlistState.currentVideoIndex];
  if (!currentVideo) return;
  
  // Update thumbnail
  const thumbnailImg = document.getElementById('mini-thumbnail-img');
  if (thumbnailImg) {
    thumbnailImg.src = currentVideo.thumbnail || '/assets/images/default-thumbnail.jpg';
    thumbnailImg.alt = currentVideo.title || 'Now Playing';
  }
  
  // Update title with seamless marquee
  updateMiniPlayerTitle(currentVideo.title || 'Unknown Title');
  
  // Update all controls
  updateMiniPlayerControls();
  
  // Update progress (if available)
  updateMiniPlayerProgress();
}
function updateMiniPlayPauseButton() {
  const playPauseBtn = document.getElementById('mini-play-pause-btn');
  if (playPauseBtn) {
    playPauseBtn.innerHTML = playlistState.isPlaying ?
      '<i class="fas fa-pause"></i>' :
      '<i class="fas fa-play"></i>';
  }
  
  // Update playing state class
  const miniPlayer = document.getElementById('mini-player');
  if (miniPlayer) {
    if (playlistState.isPlaying) {
      miniPlayer.classList.add('playing');
      
      // Resume marquee animation
      const marqueeWrapper = document.querySelector('.mini-title-wrapper');
      if (marqueeWrapper) {
        marqueeWrapper.classList.remove('paused');
      }
      
      startProgressTracking();
    } else {
      miniPlayer.classList.remove('playing');
      
      // Pause marquee animation
      const marqueeWrapper = document.querySelector('.mini-title-wrapper');
      if (marqueeWrapper) {
        marqueeWrapper.classList.add('paused');
      }
      
      stopProgressTracking();
    }
  }
}
function updateMiniPlayerProgress() {
  if (!playlistState.player || !playlistState.miniPlayerVisible) return;
  
  try {
    const currentTime = playlistState.player.getCurrentTime();
    const duration = playlistState.player.getDuration();
    
    if (duration > 0) {
      const progressPercent = (currentTime / duration) * 100;
      const progressFill = document.querySelector('.mini-progress-fill');
      if (progressFill) {
        progressFill.style.width = `${progressPercent}%`;
      }
    }
  } catch (error) {
    // Silently handle YouTube API errors
    console.debug('Progress update skipped:', error.message);
  }
}
// Unified progress tracking system
// Unified progress tracking system
function startProgressTracking() {
  // Clear any existing interval first
  stopProgressTracking();
  
  let lastUpdateTime = 0;
  const UPDATE_INTERVAL = 200; // More frequent updates for better sync
  
  playlistState.progressInterval = setInterval(() => {
    // Don't update if seeking or player not ready
    if (playlistState.isSeeking || !playlistState.player || !playlistState.player.getCurrentTime) {
      return;
    }
    
    try {
      const currentTime = playlistState.player.getCurrentTime();
      const duration = playlistState.player.getDuration();
      
      // Validate time values
      if (!isFinite(currentTime) || !isFinite(duration) || duration <= 0) {
        return;
      }
      
      // Only update if time actually changed (prevents unnecessary updates)
      if (Math.abs(currentTime - lastUpdateTime) < 0.1) {
        return;
      }
      
      lastUpdateTime = currentTime;
      
      const percent = (currentTime / duration) * 100;
      
      // Update main progress bar
      updateProgressBarVisuals(percent, currentTime, duration);
      
      // Update mini player progress if visible
      if (playlistState.miniPlayerVisible) {
        updateMiniPlayerProgress(percent);
      }
      
    } catch (error) {
      // Silently handle YouTube API errors
    }
  }, UPDATE_INTERVAL);
  
  // Add periodic sync check every 5 seconds
  playlistState.syncInterval = setInterval(() => {
    if (playlistState.isPlaying) {
      checkProgressSync();
    }
  }, 5000);
}
// Reduced from 1000ms to 500ms for smoother updates
function stopProgressTracking() {
  if (playlistState.progressInterval) {
    clearInterval(playlistState.progressInterval);
    playlistState.progressInterval = null;
  }
  
  if (playlistState.syncInterval) {
    clearInterval(playlistState.syncInterval);
    playlistState.syncInterval = null;
  }
}
// Handle window resize for marquee
function handleMarqueeResize() {
  const marqueeWrapper = document.querySelector('.mini-title-wrapper');
  const titleContainer = document.querySelector('.mini-title-container');
  
  if (marqueeWrapper && titleContainer) {
    // Recreate marquee on resize to ensure proper sizing
    const currentTitle = document.querySelector('.mini-video-title:not(.duplicate)');
    if (currentTitle) {
      updateMiniPlayerTitle(currentTitle.textContent);
    }
  }
}

// Mini Player Control Functions
function initMiniPlayerControls() {
  // Initialize mini player controls
  const miniPlayPauseBtn = document.getElementById('mini-play-pause-btn');
  const miniPrevBtn = document.getElementById('mini-prev-btn');
  const miniNextBtn = document.getElementById('mini-next-btn');
  const miniShuffleBtn = document.getElementById('mini-shuffle-btn');
  const miniRepeatBtn = document.getElementById('mini-repeat-btn');
  
  if (miniPlayPauseBtn) miniPlayPauseBtn.addEventListener('click', togglePlayPause);
  if (miniPrevBtn) miniPrevBtn.addEventListener('click', playPreviousVideo);
  if (miniNextBtn) miniNextBtn.addEventListener('click', playNextVideo);
  if (miniShuffleBtn) miniShuffleBtn.addEventListener('click', toggleShuffle);
  if (miniRepeatBtn) miniRepeatBtn.addEventListener('click', toggleRepeat);
}

function updateMiniPlayerControls() {
  // Update shuffle button
  const miniShuffleBtn = document.getElementById('mini-shuffle-btn');
  if (miniShuffleBtn) {
    miniShuffleBtn.classList.toggle('active', playlistState.isShuffled);
  }
  
  // Update repeat button
  const miniRepeatBtn = document.getElementById('mini-repeat-btn');
  if (miniRepeatBtn) {
    miniRepeatBtn.classList.toggle('active', playlistState.isRepeat);
  }
  
  // Update play/pause button
  updateMiniPlayPauseButton();
}
// Also update the scroll-to-player function to hide mini player
function scrollToPlayerSection() {
  const playerSection = document.querySelector('.player-section');
  if (playerSection) {
    playerSection.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
    
    // Hide mini player when scrolling to main player
    setTimeout(() => {
      hideMiniPlayer();
    }, 300);
    
    // Add a highlight effect
    playerSection.style.boxShadow = '0 0 0 2px rgba(255, 26, 26, 0.3)';
    setTimeout(() => {
      playerSection.style.boxShadow = 'none';
    }, 1000);
  }
}
// Initialize Open Video Button
function initOpenVideoButton() {
  const btn = document.getElementById('open-video-btn');
  if (!btn) return;
  
  btn.addEventListener('click', () => {
    if (!playlistState.playlistVideos.length || playlistState.currentVideoIndex === null) {
      showCustomAlert('No video is currently playing', 'error');
      return;
    }
    
    const currentVideo = playlistState.playlistVideos[playlistState.currentVideoIndex];
    const videoUrl = `/video.html?v=${currentVideo.videoId}`;
    window.location.href = videoUrl;
  });
}

// Sleep Timer State
const sleepTimerState = {
  timer: null,
  endTime: null,
  isActive: false,
  MAX_MINUTES: 720
};

// Initialize Sleep Timer
function initSleepTimer() {
  const timerBtn = document.getElementById('sleep-timer-btn');
  const modal = document.getElementById('sleep-timer-modal');
  const closeBtn = document.querySelector('.close-sleep-timer');
  const presetTimes = document.querySelectorAll('.preset-time');
  const customMinutes = document.getElementById('custom-minutes');
  const startBtn = document.getElementById('start-sleep-timer');
  const cancelBtn = document.getElementById('cancel-sleep-timer');
  
  timerBtn?.addEventListener('click', () => {
    modal.style.display = 'flex';
  });
  
  closeBtn?.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  
  presetTimes.forEach(btn => {
    btn.addEventListener('click', () => {
      presetTimes.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      customMinutes.value = '';
    });
  });
  
  customMinutes?.addEventListener('input', () => {
    presetTimes.forEach(b => b.classList.remove('active'));
    const minutes = parseInt(customMinutes.value);
    if (minutes > sleepTimerState.MAX_MINUTES) {
      customMinutes.value = sleepTimerState.MAX_MINUTES;
    }
  });
  
  startBtn?.addEventListener('click', () => {
    let minutes = 0;
    
    const activePreset = document.querySelector('.preset-time.active');
    if (activePreset) {
      minutes = parseInt(activePreset.dataset.minutes);
    }
    else if (customMinutes.value) {
      minutes = parseInt(customMinutes.value);
      if (isNaN(minutes) || minutes < 1 || minutes > sleepTimerState.MAX_MINUTES) {
        showCustomAlert(`Enter 1-${sleepTimerState.MAX_MINUTES} minutes`, 'error');
        return;
      }
    }
    else {
      showCustomAlert('Select or enter time', 'error');
      return;
    }
    
    startSleepTimer(minutes);
    modal.style.display = 'none';
  });
  
  cancelBtn?.addEventListener('click', () => {
    cancelSleepTimer();
    modal.style.display = 'none';
  });
  
  setInterval(updateTimerDisplay, 1000);
}

function startSleepTimer(minutes) {
  if (sleepTimerState.timer) {
    clearTimeout(sleepTimerState.timer);
  }
  
  if (minutes < 1 || minutes > sleepTimerState.MAX_MINUTES) {
    console.error('Invalid timer duration:', minutes);
    return;
  }
  
  const ms = minutes * 60 * 1000;
  sleepTimerState.endTime = Date.now() + ms;
  sleepTimerState.isActive = true;
  
  sleepTimerState.timer = setTimeout(() => {
    if (playlistState.player) {
      playlistState.player.pauseVideo();
    }
    sleepTimerState.isActive = false;
    document.getElementById('timer-active-display').style.display = 'none';
  }, ms);
  
  document.getElementById('timer-active-display').style.display = 'flex';
  showCustomAlert(`Timer set for ${minutes} min`, 'success');
}

function cancelSleepTimer() {
  if (sleepTimerState.timer) {
    clearTimeout(sleepTimerState.timer);
    sleepTimerState.timer = null;
    sleepTimerState.isActive = false;
    document.getElementById('timer-active-display').style.display = 'none';
  }
}

function updateTimerDisplay() {
  if (!sleepTimerState.isActive) return;
  
  const remainingMs = sleepTimerState.endTime - Date.now();
  if (remainingMs <= 0) {
    document.getElementById('timer-active-display').style.display = 'none';
    return;
  }
  
  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
  
  document.getElementById('timer-remaining').textContent =
    `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Mobile Detection
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

  function initScrollToPlaylistButton() {
  const btn = document.getElementById('scroll-to-playlist-btn');
  
  if (!btn) return;
  
  btn.addEventListener('click', () => {
    const currentVideoIndex = playlistState.currentVideoIndex;
    const playlistItems = document.getElementById('playlist-items');
    
    if (!playlistItems) return;
    
    // First, scroll the playlist section into view
    playlistItems.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
    
    // Then, after a short delay, scroll to the current video
    setTimeout(() => {
      if (currentVideoIndex !== -1) {
        const currentVideoItem = document.querySelector(`.playlist-item[data-index="${currentVideoIndex}"]`);
        
        if (currentVideoItem) {
          currentVideoItem.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
          
          // Highlight the current video
          currentVideoItem.style.boxShadow = '0 0 0 3px rgba(255, 26, 26, 0.5)';
          currentVideoItem.style.transition = 'box-shadow 0.3s ease';
          
          setTimeout(() => {
            currentVideoItem.style.boxShadow = 'none';
          }, 2000);
        }
      }
    }, 400); // Short delay to ensure playlist is in view first
  });
}
// Auth Modal System
const authModal = {
  modal: document.getElementById('auth-modal'),
  messageElement: document.getElementById('auth-modal-message'),
  closeBtn: document.querySelector('.auth-modal-close'),
  cancelBtn: document.querySelector('.auth-cancel-btn'),
  confirmBtn: document.querySelector('.auth-confirm-btn'),
  
  init() {
    if (!this.modal) return;
    
    this.closeBtn?.addEventListener('click', () => this.close());
    this.cancelBtn?.addEventListener('click', () => this.close());
    this.confirmBtn?.addEventListener('click', () => this.redirectToLogin());
    
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });
  },
  
  open(context = '', action = '') {
    if (!this.modal) return;
    
    const messages = {
      favorite: "Sign in to save this video to your favorites!",
      playlist: "Create an account to save and manage playlists.",
      subscribe: "Subscribe to channels by signing in first.",
      copy_playlist: "Copy playlists to your account by signing in first!",
      default: "You need to sign in to access this feature."
    };
    
    this.messageElement.textContent = messages[context] || messages.default;
    
    if (action) {
      this.confirmBtn.dataset.action = action;
    }
    
    this.modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  },
  
  close() {
    if (!this.modal) return;
    
    this.modal.classList.remove('active');
    document.body.style.overflow = '';
  },
  
  redirectToLogin() {
    const action = this.confirmBtn.dataset.action || '';
    window.location.href = `/account/login.html?redirect=${encodeURIComponent(window.location.pathname)}&action=${action}`;
  }
};

function showAuthRequired(context = '', action = '') {
  authModal.open(context, action);
}

// Channel click handler
document.getElementById('channel-clickable')?.addEventListener('click', function() {
  if (playlistState.channelInfo.id) {
    window.location.href = `/channel.html?id=${playlistState.channelInfo.id}`;
  }
});

// Handle auth state changes
onAuthStateChanged(auth, (user) => {
  if (!user) {
    console.log('No user signed in');
  } else if (playlistState.channelInfo.id) {
    const btn = document.getElementById('subscribe-btn');
    if (btn) {
      checkSubscriptionStatus(playlistState.channelInfo.id)
        .then(isSubscribed => updateSubscribeButton(btn, isSubscribed));
    }
    
    const saveBtn = document.getElementById('save-playlist-btn');
    if (saveBtn && playlistState.currentPlaylistId) {
      checkPlaylistSavedStatus(playlistState.currentPlaylistId)
        .then(isSaved => updateSavePlaylistButton(saveBtn, isSaved));
    }
  }
});


// Enhanced Background System
// Enhanced Visible Background System
function initAnimatedBackground() {
  console.log('🎨 Initializing visible thumbnail background system...');
  
  // Set initial background if we have videos
  if (playlistState.playlistVideos.length > 0) {
    const firstThumbnail = playlistState.playlistVideos[0].thumbnail;
    updateBackgroundThumbnail(firstThumbnail);
  }
  
  // Listen for video changes to update background
  const originalPlayVideo = playVideoFromPlaylist;
  playVideoFromPlaylist = function(index) {
    originalPlayVideo.call(this, index);
    
    // Update background with current video thumbnail
    const currentVideo = playlistState.playlistVideos[index];
    if (currentVideo && currentVideo.thumbnail) {
      updateBackgroundThumbnail(currentVideo.thumbnail);
    }
  };
}

function updateBackgroundThumbnail(thumbnailUrl) {
  const backgroundThumbnail = document.getElementById('background-thumbnail');
  const animatedBackground = document.getElementById('animated-background');
  
  if (!backgroundThumbnail || !animatedBackground) return;
  
  const safeThumbnailUrl = sanitize.sanitizeUrl(thumbnailUrl);
  
  console.log('🎨 Updating background with thumbnail:', safeThumbnailUrl);
  
  // Create a new image to preload
  const img = new Image();
  img.onload = function() {
    // Smooth crossfade transition
    backgroundThumbnail.style.transition = 'opacity 1s ease-in-out';
    backgroundThumbnail.style.opacity = '0';
    
    setTimeout(() => {
      backgroundThumbnail.src = safeThumbnailUrl;
      backgroundThumbnail.style.opacity = '1';
      
      // Update background state based on player
      updateBackgroundState();
      
      console.log('✅ Background thumbnail updated successfully');
    }, 300);
  };
  
  img.onerror = function() {
    console.warn('❌ Failed to load background thumbnail:', safeThumbnailUrl);
    // Keep the current background or use a fallback
  };
  
  img.src = safeThumbnailUrl;
}

function updateBackgroundState() {
  const animatedBackground = document.getElementById('animated-background');
  if (!animatedBackground) return;
  
  // Remove all state classes
  animatedBackground.classList.remove('playing', 'paused');
  
  // Add appropriate state class
  if (playlistState.isPlaying) {
    animatedBackground.classList.add('playing');
    console.log('🎵 Background state: Playing');
  } else {
    animatedBackground.classList.add('paused');
    console.log('⏸️ Background state: Paused');
  }
}

// Enhanced player state change handler for background updates

// Also update background when playlist loads initially
const originalFetchPlaylistItems = fetchPlaylistItems;
fetchPlaylistItems = async function(playlistId, retryCount = 0) {
  await originalFetchPlaylistItems.call(this, playlistId, retryCount);
  
  // Update background with first video thumbnail after playlist loads
  if (playlistState.playlistVideos.length > 0) {
    const firstThumbnail = playlistState.playlistVideos[0].thumbnail;
    updateBackgroundThumbnail(firstThumbnail);
  }
};

// Progress Bar Functions
// Progress Bar Functions - ADD AS NEW
// Enhanced Progress Bar System
function initProgressBar() {
  const progressBar = document.querySelector('.progress-bar');
  const progressFill = document.getElementById('progress-fill');
  const progressThumb = document.getElementById('progress-thumb');
  
  if (!progressBar) {
    console.warn('Progress bar elements not found');
    return;
  }
  
  let isDragging = false;
  let dragPercent = 0;
  
  // Single click to seek
  progressBar.addEventListener('click', (e) => {
    if (!playlistState.player || playlistState.isSeeking) return;
    
    const rect = progressBar.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekToPercentage(percent);
  });
  
  // Mouse drag handling
  progressThumb.addEventListener('mousedown', startDrag);
  
  // Touch handling for mobile
  progressBar.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startDrag(e.touches[0]);
  });
  
  function startDrag(startEvent) {
    if (!playlistState.player) return;
    
    isDragging = true;
    playlistState.isSeeking = true;
    document.body.classList.add('seeking');
    
    const rect = progressBar.getBoundingClientRect();
    
    function handleMove(moveEvent) {
      if (!isDragging) return;
      
      const clientX = moveEvent.clientX || (moveEvent.touches && moveEvent.touches[0].clientX);
      if (!clientX) return;
      
      dragPercent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      updateProgressVisuals(dragPercent);
      
      // Update time display during drag
      updateTimeDuringDrag(dragPercent);
    }
    
    function handleEnd() {
      if (!isDragging) return;
      
      isDragging = false;
      playlistState.isSeeking = false;
      document.body.classList.remove('seeking');
      
      seekToPercentage(dragPercent);
      
      // Cleanup event listeners
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchend', handleEnd);
    }
    
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchend', handleEnd);
    
    // Initial update
    const clientX = startEvent.clientX || (startEvent.touches && startEvent.touches[0].clientX);
    if (clientX) {
      dragPercent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      updateProgressVisuals(dragPercent);
    }
  }
  
  console.log('🎯 Progress bar initialized successfully');
}
// Single function to update all progress visuals
function updateProgressBarVisuals(percent, currentTime, duration) {
  const progressFill = document.getElementById('progress-fill');
  const progressThumb = document.getElementById('progress-thumb');
  const currentTimeEl = document.querySelector('.current-time');
  const totalTimeEl = document.querySelector('.total-time');
  
  // Update progress bar
  if (progressFill) {
    progressFill.style.width = `${percent}%`;
  }
  
  if (progressThumb) {
    progressThumb.style.left = `${percent}%`;
  }
  
  // Update time displays
  if (currentTimeEl && isFinite(currentTime)) {
    currentTimeEl.textContent = formatTime(currentTime);
  }
  
  if (totalTimeEl && isFinite(duration)) {
    totalTimeEl.textContent = formatTime(duration);
  }
}
// Separate function for drag visuals (doesn't update time displays)
function updateProgressVisuals(percent) {
  const progressFill = document.getElementById('progress-fill');
  const progressThumb = document.getElementById('progress-thumb');
  
  if (progressFill) {
    progressFill.style.width = `${percent * 100}%`;
  }
  
  if (progressThumb) {
    progressThumb.style.left = `${percent * 100}%`;
  }
}

function updateTimeDuringDrag(percent) {
  if (!playlistState.player) return;
  
  try {
    const duration = playlistState.player.getDuration();
    const currentTime = percent * duration;
    const currentTimeEl = document.querySelector('.current-time');
    
    if (currentTimeEl && isFinite(currentTime)) {
      currentTimeEl.textContent = formatTime(currentTime);
    }
  } catch (error) {
    // Silently handle during drag
  }
}

// Enhanced seek function with better state management
function seekToPercentage(percent) {
  if (!playlistState.player) return;
  
  try {
    const duration = playlistState.player.getDuration();
    const targetTime = percent * duration;
    
    if (!isFinite(targetTime) || targetTime < 0) return;
    
    playlistState.player.seekTo(targetTime, true);
    
    // Show brief feedback
    const currentTimeEl = document.querySelector('.current-time');
    if (currentTimeEl) {
      currentTimeEl.textContent = formatTime(targetTime);
    }
    
    // Reset seeking state after YouTube processes the seek
    setTimeout(() => {
      playlistState.isSeeking = false;
    }, 300);
    
  } catch (error) {
    console.error('Error seeking:', error);
    playlistState.isSeeking = false;
  }
}

function resetProgressBar() {
  const progressFill = document.getElementById('progress-fill');
  const progressThumb = document.getElementById('progress-thumb');
  const currentTimeEl = document.querySelector('.current-time');
  const totalTimeEl = document.querySelector('.total-time');
  
  if (progressFill) progressFill.style.width = '0%';
  if (progressThumb) progressThumb.style.left = '0%';
  if (currentTimeEl) currentTimeEl.textContent = '0:00';
  if (totalTimeEl) totalTimeEl.textContent = '0:00';
  
  // Clear timestamp markers
  const markersContainer = document.getElementById('timestamp-markers');
  if (markersContainer) markersContainer.innerHTML = '';
}

// Update mini player progress (simplified)
function updateProgressBar() {
  if (!playlistState.player || playlistState.isSeeking) return;
  
  try {
    const currentTime = playlistState.player.getCurrentTime();
    const duration = playlistState.player.getDuration();
    
    if (duration > 0 && isFinite(currentTime) && isFinite(duration)) {
      const percent = (currentTime / duration) * 100;
      const progressFill = document.getElementById('progress-fill');
      const progressThumb = document.getElementById('progress-thumb');
      const currentTimeEl = document.querySelector('.current-time');
      const totalTimeEl = document.querySelector('.total-time');
      
      if (progressFill) {
        progressFill.style.width = `${percent}%`;
      }
      
      if (progressThumb) {
        progressThumb.style.left = `${percent}%`;
      }
      
      if (currentTimeEl) {
        currentTimeEl.textContent = formatTime(currentTime);
      }
      
      // FIX: Always update total time when available
      if (totalTimeEl && duration > 0) {
        totalTimeEl.textContent = formatTime(duration);
      }
    }
  } catch (error) {
    // Silently handle YouTube API errors
    console.debug('Progress update skipped:', error.message);
  }
}
// Timestamp Functions - ADD THESE NEW FUNCTIONS
function extractTimestampsFromDescription(description) {
  if (!description) return [];
  
  const timestampRegex = /(\b\d{1,2}:\d{2}(?::\d{2})?\b)/g;
  const timestamps = [];
  let match;
  
  while ((match = timestampRegex.exec(description)) !== null) {
    const timestamp = match[0];
    const seconds = convertTimestampToSeconds(timestamp);
    
    if (seconds > 0) {
      timestamps.push({
        time: timestamp,
        seconds: seconds,
        position: match.index
      });
    }
  }
  
  // Remove duplicates and sort by time
  return [...new Map(timestamps.map(item => [item.seconds, item])).values()]
    .sort((a, b) => a.seconds - b.seconds);
}

function createTimestampMarkers(timestamps, duration) {
  const markersContainer = document.getElementById('timestamp-markers');
  if (!markersContainer || !duration || duration <= 0) return;
  
  markersContainer.innerHTML = '';
  
  timestamps.forEach(timestamp => {
    if (timestamp.seconds < duration) {
      const percent = (timestamp.seconds / duration) * 100;
      const marker = document.createElement('div');
      marker.className = 'timestamp-marker';
      marker.style.left = `${percent}%`;
      marker.setAttribute('data-time', timestamp.time);
      marker.setAttribute('data-seconds', timestamp.seconds);
      
      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        seekToTime(timestamp.seconds);
      });
      
      markersContainer.appendChild(marker);
    }
  });
}

function seekToTime(seconds) {
  if (!playlistState.player) return;
  
  try {
    playlistState.isSeeking = true;
    playlistState.player.seekTo(seconds, true);
    
    showCustomAlert(`Jumping to ${formatTime(seconds)}`, 'info', 1000);
    
    setTimeout(() => {
      playlistState.isSeeking = false;
    }, 500);
    
  } catch (error) {
    console.error('Error seeking to timestamp:', error);
    playlistState.isSeeking = false;
  }
}

function updateTimestampMarkers() {
  const currentVideo = playlistState.playlistVideos[playlistState.currentVideoIndex];
  if (!currentVideo || !currentVideo.description) return;
  
  try {
    const duration = playlistState.player.getDuration();
    if (duration > 0) {
      const timestamps = extractTimestampsFromDescription(currentVideo.description);
      createTimestampMarkers(timestamps, duration);
    }
  } catch (error) {
    console.debug('Timestamp markers update skipped:', error.message);
  }
}
function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Enhanced player state change handler
// Single combined onPlayerStateChange function
const originalOnPlayerStateChange = onPlayerStateChange;
onPlayerStateChange = function(event) {
  // Call the original function first
  originalOnPlayerStateChange(event);
  
  // Progress tracking management
  switch (event.data) {
    case YT.PlayerState.PLAYING:
      if (!playlistState.progressInterval) {
        startProgressTracking();
      }
      break;
      
    case YT.PlayerState.PAUSED:
    case YT.PlayerState.ENDED:
    case YT.PlayerState.BUFFERING:
      // Keep tracking but maybe reduce frequency
      break;
      
    case YT.PlayerState.CUED:
      // Reset progress when new video is cued
      resetProgressBar();
      break;
  }
  
  // Background state updates
  updateBackgroundState();
};// Handle video quality/buffering issues
// Handle video quality/buffering issues
function checkProgressSync() {
  if (!playlistState.player || !playlistState.isPlaying) return;
  
  try {
    const expectedProgress = playlistState.player.getCurrentTime();
    const progressFill = document.getElementById('progress-fill');
    
    if (progressFill) {
      const currentWidth = parseFloat(progressFill.style.width) || 0;
      const duration = playlistState.player.getDuration();
      const expectedWidth = (expectedProgress / duration) * 100;
      
      // If progress is out of sync by more than 2%, force update
      if (Math.abs(currentWidth - expectedWidth) > 2) {
        updateProgressBarVisuals(expectedWidth, expectedProgress, duration);
      } 
    }
  } catch (error) {
    // Silently handle errors
  }
}

// New Header Functionality
// New Header Functionality
function initNewHeader() {
  console.log('🎯 Initializing new transparent header...');
  
  try {
    // Initialize back button with null check
    const backButton = document.getElementById('back-button');
    if (backButton) {
      backButton.addEventListener('click', goBack);
      console.log('✅ Back button initialized');
    } else {
      console.warn('❌ Back button not found');
    }
    
    // Initialize search functionality
    initSearchFunctionality();
    
    // Add scroll effect to header
    initHeaderScrollEffect();
    
    console.log('✅ New header initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing new header:', error);
  }
}

function updateHeaderChannelName() {
  const channelNameElement = document.getElementById('header-channel-name');
  if (channelNameElement) {
    if (playlistState.channelInfo && playlistState.channelInfo.name) {
      channelNameElement.textContent = playlistState.channelInfo.name;
      console.log('✅ Header channel name updated:', playlistState.channelInfo.name);
    } else {
      channelNameElement.textContent = 'Unknown Channel';
    }
  }
}

function goBack() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = '/';
  }
}

function initHeaderScrollEffect() {
  const header = document.querySelector('.transparent-header');
  if (!header) {
    console.warn('❌ Header element not found for scroll effect');
    return;
  }
  
  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    if (currentScrollY > 100) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });
}

// Search Functionality
function initSearchFunctionality() {
  console.log('🎯 Initializing search functionality...');
  
  try {
    const searchButton = document.getElementById('search-button');
    const searchModal = document.getElementById('full-search-modal');
    const searchBackButton = document.getElementById('search-back-button');
    const searchInput = document.getElementById('full-search-input');
    const clearSearch = document.getElementById('clear-search');
    const searchTabs = document.querySelectorAll('.search-tab');
    const youtubeSearchBtn = document.getElementById('youtube-search-btn');
    
    // Check if all elements exist
    if (!searchButton || !searchModal || !searchBackButton || !searchInput) {
      console.error('❌ Missing search elements:', {
        searchButton: !!searchButton,
        searchModal: !!searchModal,
        searchBackButton: !!searchBackButton,
        searchInput: !!searchInput
      });
      return;
    }
    
    // Open search modal
    searchButton.addEventListener('click', () => {
      console.log('🔍 Opening search modal');
      searchModal.classList.add('active');
      setTimeout(() => searchInput.focus(), 100);
    });
    
    // Close search modal
    searchBackButton.addEventListener('click', () => {
      console.log('🔍 Closing search modal');
      searchModal.classList.remove('active');
      searchInput.value = '';
      clearSearchResults();
    });
    
    // Clear search input
    clearSearch?.addEventListener('click', () => {
      searchInput.value = '';
      searchInput.focus();
      clearSearchResults();
    });
    
    // Search input handler with debounce
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        performSearch(e.target.value);
      }, 300);
    });
    
    // Tab switching
    searchTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        console.log('🔍 Switching to tab:', targetTab);
        switchSearchTab(targetTab);
      });
    });
    
    // YouTube search button
    youtubeSearchBtn?.addEventListener('click', () => {
      const searchInput = document.getElementById('full-search-input');
      const query = searchInput.value.trim();
      searchOnYouTube(query);
    });
    
    // Close modal on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchModal.classList.contains('active')) {
        searchModal.classList.remove('active');
        searchInput.value = '';
        clearSearchResults();
      }
    });
    
    // Initialize event delegation for search results
    initSearchEventDelegation();
    
    console.log('✅ Search functionality initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing search functionality:', error);
  }
}

function initSearchEventDelegation() {
  const searchResultsContainer = document.getElementById('playlist-search-results');
  
  if (searchResultsContainer) {
    searchResultsContainer.addEventListener('click', (e) => {
      const searchItem = e.target.closest('.playlist-search-item');
      if (searchItem) {
        const index = parseInt(searchItem.getAttribute('data-search-index'));
        console.log('🎯 Tapped search result, index:', index);
        if (!isNaN(index)) {
          playFromSearch(index);
        }
      }
    });
    console.log('✅ Search event delegation initialized');
  } else {
    console.warn('❌ Search results container not found');
  }
}

function switchSearchTab(tabName) {
  const tabs = document.querySelectorAll('.search-tab');
  const playlistResults = document.getElementById('playlist-search-results');
  const youtubeResults = document.getElementById('youtube-search-results');
  
  if (!playlistResults || !youtubeResults) {
    console.error('❌ Search result containers not found');
    return;
  }
  
  tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  if (tabName === 'playlist') {
    playlistResults.classList.remove('hidden');
    youtubeResults.classList.add('hidden');
    
    // Re-perform search for current query
    const searchInput = document.getElementById('full-search-input');
    if (searchInput && searchInput.value) {
      performPlaylistSearch(searchInput.value);
    }
  } else {
    playlistResults.classList.add('hidden');
    youtubeResults.classList.remove('hidden');
  }
}

function performSearch(query) {
  const activeTab = document.querySelector('.search-tab.active');
  if (!activeTab) return;
  
  const tabName = activeTab.dataset.tab;
  console.log('🔍 Performing search:', query, 'on tab:', tabName);
  
  if (tabName === 'playlist') {
    performPlaylistSearch(query);
  }
}

 function performPlaylistSearch(query) {
  const resultsContainer = document.getElementById('playlist-search-results');
  
  if (!resultsContainer) {
    console.error('❌ Playlist search results container not found');
    return;
  }
  
  if (!query.trim()) {
    clearSearchResults();
    return;
  }
  
  const searchTerm = query.toLowerCase();
  const results = playlistState.playlistVideos.filter(video => 
    video.title.toLowerCase().includes(searchTerm) ||
    (video.channel && video.channel.toLowerCase().includes(searchTerm))
  );
  
  console.log('🔍 Found', results.length, 'results for:', query);
  displayPlaylistSearchResults(results);
}

function displayPlaylistSearchResults(results) {
  const resultsContainer = document.getElementById('playlist-search-results');
  
  if (!resultsContainer) {
    console.error('❌ Results container not found');
    return;
  }
  
  if (results.length === 0) {
    resultsContainer.innerHTML = `
      <div class="no-results">
        <i class="fas fa-search"></i>
        <p>No videos found in this playlist</p>
        <p class="search-suggestion">Try searching on YouTube instead</p>
      </div>
    `;
    // Enable scrolling even for no results
    resultsContainer.style.overflowY = 'auto';
    resultsContainer.style.minHeight = '0';
    return;
  }
  
  // Enable scrolling for results
  resultsContainer.style.overflowY = 'auto';
  resultsContainer.style.minHeight = '0';
  
  resultsContainer.innerHTML = results.map((video, index) => {
    const originalIndex = playlistState.playlistVideos.findIndex(v => v.videoId === video.videoId);
    const isActive = originalIndex === playlistState.currentVideoIndex;
    
    return `
      <div class="playlist-search-item ${isActive ? 'active' : ''}" 
           data-search-index="${originalIndex}">
        <div class="playlist-search-thumbnail">
          <img src="${sanitize.sanitizeUrl(video.thumbnail)}" 
               alt="${sanitize.escapeHtml(video.title)}"
               onerror="this.src='/assets/images/default-thumbnail.jpg'">
        </div>
        <div class="playlist-search-info">
          <div class="playlist-search-title">${sanitize.escapeHtml(video.title)}</div>
          <div class="playlist-search-channel">${sanitize.escapeHtml(video.channel)}</div>
        </div>
        <div class="search-item-number">#${originalIndex + 1}</div>
      </div>
    `;
  }).join('');
  
  console.log('✅ Displayed', results.length, 'search results with scrolling enabled');
}

function playFromSearch(index) {
  console.log('🎯 Playing from search, index:', index);
  
  // Convert index to number and validate
  const videoIndex = parseInt(index);
  
  if (isNaN(videoIndex) || videoIndex < 0 || videoIndex >= playlistState.playlistVideos.length) {
    console.error('❌ Invalid video index from search:', index);
    showCustomAlert('Cannot play this video', 'error');
    return;
  }
  
  try {
    // Play the video
    playVideoFromPlaylist(videoIndex);
    
    // Close search modal
    const searchModal = document.getElementById('full-search-modal');
    if (searchModal) {
      searchModal.classList.remove('active');
    }
    
    // Clear search input
    const searchInput = document.getElementById('full-search-input');
    if (searchInput) {
      searchInput.value = '';
    }
    
    // Clear search results
    clearSearchResults();
    
    console.log('✅ Successfully played video from search');
    
  } catch (error) {
    console.error('❌ Error playing from search:', error);
    showCustomAlert('Failed to play video', 'error');
  }
}

function searchOnYouTube(query) {
  console.log('🔍 Searching YouTube for:', query);
  const searchQuery = query || '';
  const searchUrl = `/search.html?q=${encodeURIComponent(searchQuery)}`;
  window.location.href = searchUrl;
}

function clearSearchResults() {
  const playlistResults = document.getElementById('playlist-search-results');
  const youtubeResults = document.getElementById('youtube-search-results');
  
  if (playlistResults) {
    playlistResults.innerHTML = `
      <div class="no-results">
        <i class="fas fa-search"></i>
        <p>Search for videos in this playlist</p>
      </div>
    `;
    // Reset scrolling properties
    playlistResults.style.overflowY = 'auto';
    playlistResults.style.minHeight = '0';
  }
  
  if (youtubeResults) {
    youtubeResults.innerHTML = `
      <div class="youtube-search-section">
        <div class="youtube-search-prompt">Search YouTube for more videos</div>
        <button class="search-youtube-btn" id="youtube-search-btn">
          <i class="fab fa-youtube"></i>
          Search YouTube
        </button>
      </div>
    `;
    
    // Re-attach YouTube search button event
    const youtubeSearchBtn = document.getElementById('youtube-search-btn');
    if (youtubeSearchBtn) {
      youtubeSearchBtn.addEventListener('click', () => {
        const searchInput = document.getElementById('full-search-input');
        const query = searchInput ? searchInput.value.trim() : '';
        searchOnYouTube(query);
      });
    }
  }
}
// Make functions globally available
window.playFromSearch = playFromSearch;
window.searchOnYouTube = searchOnYouTube;

// Brand icon fallback function
// Logo error handler
// Logo error handler
function handleLogoError(img) {
  console.log('🎯 Logo failed to load, using fallback icon');
  
  // Replace with a play icon
  const navIcon = img.closest('.nav-icon');
  if (navIcon) {
    navIcon.innerHTML = '<i class="fas fa-play"></i>';
    navIcon.style.fontSize = '1.4rem';
    navIcon.style.color = 'rgba(255, 255, 255, 0.8)';
  }
}

// Initialize premium navigation
function initPremiumNavigation() {
  console.log('🎯 Initializing premium icons-only navigation...');
  
  // Set active state based on current page
  const currentPath = window.location.pathname;
  const navItems = document.querySelectorAll('.premium-nav .nav-item');
  
  navItems.forEach(item => {
    const href = item.getAttribute('href');
    if (href && currentPath.includes(href.replace('.html', ''))) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
  
  // Special case for home page
  if (currentPath === '/' || currentPath === '/index.html') {
    const homeItem = document.querySelector('.premium-nav .nav-item[href="/"]');
    if (homeItem) {
      homeItem.classList.add('active');
    }
  }
  
  console.log('✅ Premium icons-only navigation initialized');
}

// Add to your initializePlaylistPage function:
