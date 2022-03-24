import WebSocket, { ServerOptions } from "isomorphic-ws";
import {
  Message,
  jsonToBase64,
  base64ToJson
} from "@truffle/dashboard-message-bus-common";
import any from "promise.any";

any.shim();

/**
 * Starts a websocket server and waits for it to be opened
 * @dev If you need to attach event listeners *before* the server connection opens,
 * do not use this function since it resolves *after* the connection is opened
 */
export const startWebSocketServer = (options: ServerOptions) => {
  return new Promise<WebSocket.Server>(resolve => {
    const server = new WebSocket.Server(options, () => {
      resolve(server);
    });
  });
};

/**
 * Broadcast a message to multiple websocket connections and disregard them
 */
export const broadcastAndDisregard = (
  sockets: WebSocket[],
  message: Message
) => {
  const encodedMessage = jsonToBase64(message);
  sockets.forEach(socket => {
    socket.send(encodedMessage);
  });
};

/**
 * Broadcast a message to multuple websocket connections and return the first response
 */
export const broadcastAndAwaitFirst = async (
  sockets: WebSocket[],
  message: Message
) => {
  const promises = sockets.map(socket => sendAndAwait(socket, message));
  const result = await Promise.any(promises);
  return result;
};

/**
 * Send a message to a websocket connection and await a matching response
 * @dev Responses are matched by looking at received messages that match the ID of the sent message
 */
export const sendAndAwait = (socket: WebSocket, message: Message) => {
  return new Promise<any>((resolve, reject) => {
    const handlers = {
      message: (data: WebSocket.Data) => {
        socket.off("error", handlers.error);
        socket.off("close", handlers.close);

        if (typeof data !== "string") {
          data = data.toString();
        }

        const response = base64ToJson(data);
        if (response.id !== message.id) return;
        resolve(response);
      },
      // TODO: Need to check that the error corresponds to the sent message?
      error: (err: Error) => {
        socket.off("message", handlers.message);
        socket.off("close", handlers.close);

        reject(err);
      },

      close: (code: number, reason: string) => {
        socket.off("message", handlers.message);
        socket.off("error", handlers.error);

        reject(
          new Error(
            `Socket connection closed with code '${code}' and reason '${reason}'`
          )
        );
      }
    };

    socket.once("message", handlers.message);
    socket.once("error", handlers.error);
    socket.once("close", handlers.close);

    const encodedMessage = jsonToBase64(message);
    socket.send(encodedMessage);
  });
};
