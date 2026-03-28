import React, { useState } from 'react';
import { GameConfig } from './types';
import { SetupScreen } from './components/SetupScreen';
import { GameBoard } from './components/GameBoard';

type Screen = 'setup' | 'game';

export default function App() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);

  const handleStartGame = (config: GameConfig) => {
    setGameConfig(config);
    setScreen('game');
  };

  const handleBackToSetup = () => {
    setScreen('setup');
    setGameConfig(null);
  };

  if (screen === 'game' && gameConfig) {
    return <GameBoard config={gameConfig} onBackToSetup={handleBackToSetup} />;
  }

  return <SetupScreen onStartGame={handleStartGame} />;
}
