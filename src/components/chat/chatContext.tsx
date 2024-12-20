import React from "react";
import { createContext } from "react";

type StreamResponse = {
  addMessage: () => void;
  message: string;
  handleInputChanger: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  isLoading: boolean;
};

export const ChatContext = createContext({
  addMessage: () => {},
  message: "",
  handleInputChanger: () => {},
  isLoading: false,
});

export const ChatContextProvider = () => {};
