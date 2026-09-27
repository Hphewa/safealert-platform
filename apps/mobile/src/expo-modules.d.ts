declare module 'expo-location' {
  export enum PermissionStatus {
    GRANTED = 'granted',
    DENIED = 'denied',
    UNDETERMINED = 'undetermined'
  }

  export enum Accuracy {
    Lowest = 0,
    Balanced = 1,
    High = 2,
    Highest = 3,
    BestForNavigation = 4
  }

  export type LocationPermissionResponse = {
    status: PermissionStatus;
  };

  export type LocationCoordinates = {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };

  export type LocationObject = {
    coords: LocationCoordinates;
    timestamp: number;
  };

  export function requestForegroundPermissionsAsync(): Promise<LocationPermissionResponse>;
  export function getCurrentPositionAsync(options?: {
    accuracy?: Accuracy;
  }): Promise<LocationObject>;
}

declare module 'expo-image-picker' {
  export enum PermissionStatus {
    GRANTED = 'granted',
    DENIED = 'denied',
    UNDETERMINED = 'undetermined'
  }

  export enum MediaTypeOptions {
    Images = 'Images'
  }

  export type MediaType = 'images' | 'videos' | 'livePhotos';

  export type ImagePickerPermissionResponse = {
    status: PermissionStatus;
  };

  export type ImagePickerAsset = {
    uri: string;
    width?: number;
    height?: number;
    type?: string;
    fileName?: string;
    mimeType?: string | null;
    assetId?: string | null;
    base64?: string | null;
    fileSize?: number;
  };

  export type ImagePickerSuccessResult = {
    canceled: false;
    assets: ImagePickerAsset[];
  };

  export type ImagePickerCanceledResult = {
    canceled: true;
    assets: [];
  };

  export type ImagePickerResult = ImagePickerSuccessResult | ImagePickerCanceledResult;

  export function requestMediaLibraryPermissionsAsync(): Promise<ImagePickerPermissionResponse>;
  export function requestCameraPermissionsAsync(): Promise<ImagePickerPermissionResponse>;
  export function launchImageLibraryAsync(options?: {
    allowsEditing?: boolean;
    mediaTypes?: MediaType | MediaType[] | MediaTypeOptions;
    quality?: number;
    base64?: boolean;
    allowsMultipleSelection?: boolean;
    selectionLimit?: number;
  }): Promise<ImagePickerResult>;
  export function launchCameraAsync(options?: {
    allowsEditing?: boolean;
    mediaTypes?: MediaType | MediaType[] | MediaTypeOptions;
    quality?: number;
  }): Promise<ImagePickerResult>;
}
