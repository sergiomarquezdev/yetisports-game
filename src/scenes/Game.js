/**
 * Escena Game - Escena principal donde ocurre la jugabilidad
 * Controla el flujo de juego, la física y las interacciones
 */

import Phaser from 'phaser';
import physicsConfig from '../config/physicsConfig';
import PowerBar from '../components/ui/PowerBar';
import AngleIndicator from '../components/ui/AngleIndicator';
import CameraController from '../utils/CameraController';
import GameOverScreen from '../components/ui/GameOverScreen';
import CharacterManager from '../components/characters/CharacterManager';
import GameStateManager from '../utils/GameStateManager';
import ScoreManager from '../utils/ScoreManager';
import GameUI from '../components/ui/GameUI';
import LaunchManager from '../components/gameplay/LaunchManager';
// Importar los nuevos componentes
import CloudManager from '../components/environment/CloudManager';
import BackgroundManager from '../components/environment/BackgroundManager';
import GroundManager from '../components/environment/GroundManager';

export default class Game extends Phaser.Scene {
  constructor() {
    super('Game');

    // Punto de inicio del lanzamiento
    this.launchPositionX = 710;
    this.launchPositionY = 540;

    // Control de cámara
    this.initialCameraX = 400; // Posición inicial X de la cámara

    // Flag para indicar si estamos esperando el primer clic
    this.waitingForFirstClick = false;
  }

  create() {
    // Configurar el mundo físico con límites extendidos hacia la izquierda (valores negativos de X)
    this.matter.world.setBounds(-10000, 0, 20000, 600);
    // Reducir la gravedad para un vuelo más lento y mayor deslizamiento
    this.matter.world.setGravity(0, 0.3);

    // Inicializar gestores principales
    this.stateManager = new GameStateManager();
    this.scoreManager = new ScoreManager(this, {
      pixelToMeterRatio: 10 // Escala arbitraria para el juego
    });

    // Inicializar los gestores de entorno
    this.backgroundManager = new BackgroundManager(this);
    this.backgroundManager.create();

    this.groundManager = new GroundManager(this);
    this.groundManager.create();

    // Inicializar el gestor de nubes
    this.cloudManager = new CloudManager(this);
    this.cloudManager.create();

    // Inicializar gestor de personajes
    this.characterManager = new CharacterManager(this, {
      launchPositionX: this.launchPositionX,
      launchPositionY: this.launchPositionY
    });
    this.characterManager.createCharacters();

    // Inicializar controlador de cámara
    this.cameraController = new CameraController(this, {
      worldBounds: { x: -10000, y: 0, width: 20000, height: 600 },
      initialCenterX: this.initialCameraX,
      initialCenterY: 300
    });

    // Inicializar componentes UI
    this.angleIndicator = new AngleIndicator(this, {
      originX: this.launchPositionX,
      originY: this.launchPositionY + 5,
      minAngle: physicsConfig.angle.min,
      maxAngle: physicsConfig.angle.max
    });

    this.powerBar = new PowerBar(this, {
      barX: this.scale.width - 35,
      barY: this.launchPositionY - 65
    });

    this.gameOverScreen = new GameOverScreen(this);

    // Crear interfaz de usuario
    this.gameUI = new GameUI(this);
    this.gameUI.createUI();

    // Inicializar gestor de lanzamiento
    this.launchManager = new LaunchManager(this);

    // Configurar la entrada de usuario
    this.setupInput();

    // Iniciar el juego
    this.startGame();
  }

  update() {
    // Obtener el estado actual del juego
    const gameState = this.stateManager.getState();

    // En estado FLYING, actualizar a estado GAME_OVER si el pingüino se detiene
    if (gameState === 'FLYING') {
      if (this.characterManager.updatePenguinPhysics()) {
        this.endLaunch();
      }

      // Verificar si el pingüino está fuera de los límites del mundo y ajustar la cámara
      // Esta verificación adicional ayuda con las nubes y el comportamiento de cámara
      const penguin = this.characterManager.penguin;
      if (penguin && penguin.x < this.cameraController.getInitialScrollX() - 5000) {
        // Si el pingüino se ha ido demasiado lejos, forzar la detención del vuelo
        console.log('Penguin went too far, stopping flight');
        this.endLaunch();
      }
    }

    // Actualizar la distancia si el pingüino está en el aire
    if (gameState === 'FLYING') {
      // Actualizar la puntuación
      this.scoreManager.updateDistance(this.characterManager.getPenguinCurrentX(), this.launchPositionX);

      // Actualizar UI
      this.gameUI.updateDistanceText(this.scoreManager.currentDistance, this.scoreManager.totalDistance);

      // Gestionar el seguimiento de la cámara basado en la posición del pingüino
      this.cameraController.followTarget(this.characterManager.penguin, true);
    }
  }

  /**
   * Configurar la entrada de usuario
   */
  setupInput() {
    // Configurar la entrada de clic para seleccionar ángulo y potencia
    this.input.on('pointerdown', () => {
      this.handlePlayerInput();
    });

    // Configurar la tecla Escape para volver al menú
    this.input.keyboard.on('keydown-ESC', () => {
      this.backToMenu();
    });

    // Configurar la tecla R para reiniciar el juego
    this.input.keyboard.on('keydown-R', () => {
      this.restartGame();
    });
  }

  /**
   * Vuelve al menú principal
   */
  backToMenu() {
    // Asegurarse de que el estado de modal está cerrado
    if (this.stateManager) {
      this.stateManager.setModalState(false);
    }

    // Efecto de transición
    this.cameraController.fade({
      callback: () => {
        // Detener las físicas para evitar problemas
        this.matter.world.pause();

        // Volver a la escena del menú
        this.scene.start('Menu');
      }
    });
  }

  /**
   * Reinicia el juego actual
   */
  restartGame() {
    // Iniciar algunas acciones de reinicio inmediatamente
    this.stateManager.setState('RESETTING');

    // Asegurarse de que el modal está cerrado
    this.stateManager.setModalState(false);

    // Detener físicas inmediatamente
    this.matter.world.pause();

    // Resetear velocidades inmediatamente para detener cualquier movimiento visible
    if (this.characterManager.penguin && this.characterManager.penguin.body) {
      this.characterManager.penguin.setVelocity(0, 0);
      this.characterManager.penguin.setAngularVelocity(0);
    }

    // Asegurarnos de limpiar cualquier texto del ángulo
    if (this.angleIndicator && typeof this.angleIndicator.clearTexts === 'function') {
      this.angleIndicator.clearTexts();
    }

    // Retrasar 200 ms el flash:
    setTimeout(() => {
      // Efecto de transición con flash blanco (más corto)
      this.cameraController.flash({
        duration: 200,
        color: 0xffffff
      });

      // Restablecer la posición de la cámara inmediatamente
      this.cameraController.setScrollX(this.cameraController.getInitialScrollX());

      // Reiniciar todos los valores del juego
      this.stateManager.reset();
      this.scoreManager.resetCurrentDistance();
      this.scoreManager.resetTotalDistance();

      // Actualizar textos de distancia
      this.gameUI.updateDistanceText(0, 0);

      // Actualizar la UI de intentos
      this.gameUI.updateAttemptsUI(0, this.stateManager.getMaxAttempts());

      // Eliminar textos existentes
      this.cleanupTexts();

      // Reiniciar posición del pingüino
      this.characterManager.resetPositions();

      // Reanudar físicas
      this.matter.world.resume();

      // Iniciar el juego nuevamente
      this.startGame();
    }, 100);
  }

  /**
   * Elimina textos temporales de la escena
   */
  cleanupTexts() {
    this.children.list
      .filter(child => child.type === 'Text' &&
        (child.text.includes('JUEGO TERMINADO') ||
          child.text.includes('Distancia total') ||
          child.text.includes('Haz clic para') ||
          child.text.includes('NUEVO RÉCORD') ||
          child.text.includes('Ángulo') ||  // Más genérico para incluir cualquier texto con "Ángulo"
          child.name === 'angleText'))      // Buscar por nombre también
        .forEach(text => {
          text.destroy();
        });
  }

  /**
   * Inicia el juego
   */
  startGame() {
    this.stateManager.setState('READY');

    // Mostrar mensaje de inicio
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const startPrompt = this.add.text(width / 2, 170, 'Haz clic para comenzar', {
      fontFamily: 'Arial',
      fontSize: '32px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5).setScrollFactor(0).setName('startPrompt');

    // Animar el texto
    this.tweens.add({
      targets: startPrompt,
      alpha: 0.5,
      duration: 500,
      yoyo: true,
      repeat: -1
    });

    // Mostrar mensaje informativo sobre los controles
    this.gameUI.showControlsInfo();

    // Establecer flag para saber que estamos esperando el primer clic
    this.waitingForFirstClick = true;
  }

  /**
   * Maneja la entrada del jugador según el estado del juego
   */
  handlePlayerInput() {
    // Si hay un modal abierto, ignorar completamente la entrada
    if (this.stateManager.isModalOpen) {
      return;
    }

    // Si estamos en proceso de reiniciar, ignorar la entrada
    if (this.stateManager.isResetting) {
      return;
    }

    // Si estamos esperando el primer clic, comenzar la selección de ángulo
    if (this.waitingForFirstClick) {
      this.waitingForFirstClick = false;

      // Eliminar todos los textos de inicio
      this.children.list
        .filter(child => child.type === 'Text' && child.text === 'Haz clic para comenzar')
        .forEach(text => text.destroy());

      // Eliminar el contenedor de controles
      const controlsInfo = this.children.getByName('controlsInfo');
      if (controlsInfo) controlsInfo.destroy();

      this.launchManager.startAngleSelection();
      return;
    }

    // Basado en el estado actual del juego
    switch (this.stateManager.currentState) {
      case 'ANGLE_SELECTION':
        this.launchManager.endAngleSelection();
        this.launchManager.startPowerSelection();
        break;

      case 'POWER_SELECTION':
        this.launchManager.endPowerSelection();
        this.launchManager.launchPenguin();
        break;

      case 'ENDED':
        // Prevenir múltiples reinicios debido a clics rápidos
        if (this.stateManager.isResetting) {
          return;
        }

        // Establecer el flag de reinicio
        this.stateManager.isResetting = true;

        // Eliminar el contenedor de controles si existe
        const controlsInfo = this.children.getByName('controlsInfo');
        if (controlsInfo) controlsInfo.destroy();

        this.resetLaunch();
        break;

      default:
        break;
    }
  }

  /**
   * Finaliza el lanzamiento actual
   */
  endLaunch() {
    // Detener el pingüino completamente antes de procesar el final del lanzamiento
    if (this.characterManager && this.characterManager.penguin) {
      this.characterManager.penguin.setVelocity(0, 0);
      this.characterManager.penguin.setAngularVelocity(0);
    }

    // Acumular la distancia actual al total
    this.scoreManager.addCurrentToTotal();

    // Animar actualización del total
    this.tweens.add({
      targets: this.gameUI.distanceText,
      scaleX: { from: 1.3, to: 1 },
      scaleY: { from: 1.3, to: 1 },
      duration: 300,
      ease: 'Back.easeOut'
    });

    // Verificar si hemos alcanzado el número máximo de intentos
    if (this.stateManager.isGameOver()) {
      this.endGame();
    } else {
      // Preparar para el siguiente lanzamiento
      this.gameUI.showNextLaunchPrompt();
      this.stateManager.setState('ENDED');
    }
  }

  /**
   * Finaliza el juego actual
   */
  endGame() {
    // Cambiar estado y abrir modal
    this.stateManager.setState('ENDED');
    this.stateManager.setModalState(true);

    // Comprobar si hemos batido el récord
    const isNewRecord = this.scoreManager.checkAndUpdateBestDistance();

    if (isNewRecord) {
      // Actualizar el texto de mejor distancia
      this.gameUI.updateBestDistanceText(this.scoreManager.bestTotalDistance);
    }

    // Definir los callbacks para depurar y asegurar ejecución
    const handleRestart = () => {
      // Verificar que podemos reiniciar
      this.stateManager.setModalState(false);

      // Llamar a restartGame después de un breve retraso
      this.time.delayedCall(100, () => {
        this.restartGame();
      });
    };

    const handleMainMenu = () => {
      // Verificar que podemos ir al menú
      this.stateManager.setModalState(false);

      // Llamar a backToMenu después de un breve retraso
      this.time.delayedCall(100, () => {
        this.backToMenu();
      });
    };

    // Desactivar input brevemente para evitar clics accidentales
    this.input.enabled = false;

    // Después de un breve retraso, mostrar la pantalla de fin de juego
    this.time.delayedCall(200, () => {
      // Reactivar input para permitir clics en los botones
      this.input.enabled = true;

      // Mostrar pantalla de fin de juego con los callbacks
      this.gameOverScreen.show({
        totalDistance: this.scoreManager.totalDistance,
        bestDistance: this.scoreManager.bestTotalDistance,
        onRestart: handleRestart,
        onMainMenu: handleMainMenu
      });
    });
  }

  /**
   * Reinicia la posición para un nuevo lanzamiento
   */
  resetLaunch() {
    // Restablecer la posición de la cámara con una animación
    this.cameraController.resetToInitial();

    // Posicionar personajes fuera de la pantalla para la animación
    this.characterManager.positionOffscreen();

    // Restablecer propiedades del pingüino
    this.characterManager.penguin.setVelocity(0, 0);
    this.characterManager.penguin.setAngularVelocity(0);
    this.characterManager.penguin.setAngle(0);
    this.characterManager.penguin.setStatic(true);

    // Asegurarnos de limpiar cualquier texto del ángulo
    if (this.angleIndicator && typeof this.angleIndicator.clearTexts === 'function') {
      this.angleIndicator.clearTexts();
    }

    // Reiniciamos solo la distancia actual para el nuevo intento
    this.scoreManager.resetCurrentDistance();

    // Eliminar todos los textos temporales
    this.cleanupTexts();

    // Añadir mensaje "Preparando el lanzamiento..."
    const width = this.cameras.main.width;
    const preparingText = this.add.text(width / 2, 170, 'Preparando el lanzamiento...', {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5).setScrollFactor(0).setName('preparingText');

    // Animar la entrada de los personajes
    this.characterManager.animateEntrance(() => {
      // Eliminar texto "Preparando el lanzamiento..."
      preparingText.destroy();

      // Iniciar la selección de ángulo
      this.launchManager.startAngleSelection();

      // Restablecer el flag de reinicio para permitir futuros reinicios
      this.stateManager.isResetting = false;
    });
  }

  /**
   * Limpia los recursos cuando la escena es destruida
   */
  shutdown() {
    // Limpiar eventos y recursos
    if (this.cloudManager) {
      this.cloudManager.destroy();
    }

    // Llamar a shutdown de la clase padre
    super.shutdown();
  }

  /**
   * Limpia los recursos cuando la escena es destruida
   * (La API de Phaser llama a este método)
   */
  destroy() {
    this.launchManager = null;
    this.stateManager = null;
    this.characterManager = null;
    this.cameraController = null;
    this.scoreManager = null;

    super.destroy();
  }
}
