import { ApiError } from '../../../shared/apiError.js';

export type MultipartFile = {
  fieldName: string;
  originalFilename: string | null;
  contentType: string;
  buffer: Buffer;
};

type MultipartHeaderMap = Record<string, string>;

export function parseSingleFileMultipartBody(
  body: Buffer,
  contentTypeHeader: string | undefined,
  expectedFieldName: string
): MultipartFile {
  const boundary = boundaryFromContentType(contentTypeHeader);
  const boundaryMarker = Buffer.from(`--${boundary}`);
  const parts = splitMultipartBody(body, boundaryMarker);
  const files = parts
    .map(parseMultipartPart)
    .filter((part): part is MultipartFile => part !== null && part.originalFilename !== null);

  const file = files.find((part) => part.fieldName === expectedFieldName);

  if (!file || file.buffer.length === 0) {
    throw new ApiError(400, 'MEDIA_FILE_REQUIRED', 'Upload one image file.');
  }

  return file;
}

function boundaryFromContentType(contentTypeHeader: string | undefined) {
  if (!contentTypeHeader?.toLowerCase().startsWith('multipart/form-data')) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use multipart/form-data.');
  }

  const boundaryMatch = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentTypeHeader);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];

  if (!boundary) {
    throw new ApiError(400, 'INVALID_MULTIPART_REQUEST', 'Multipart boundary is required.');
  }

  return boundary;
}

function splitMultipartBody(body: Buffer, boundaryMarker: Buffer) {
  const parts: Buffer[] = [];
  let searchFrom = 0;

  while (searchFrom < body.length) {
    const markerIndex = body.indexOf(boundaryMarker, searchFrom);

    if (markerIndex === -1) {
      break;
    }

    const contentStart = markerIndex + boundaryMarker.length;
    const isFinalBoundary = body.subarray(contentStart, contentStart + 2).equals(Buffer.from('--'));

    if (isFinalBoundary) {
      break;
    }

    const partStart = body.subarray(contentStart, contentStart + 2).equals(Buffer.from('\r\n'))
      ? contentStart + 2
      : contentStart;
    const nextMarkerIndex = body.indexOf(boundaryMarker, partStart);

    if (nextMarkerIndex === -1) {
      break;
    }

    const partEnd = body.subarray(nextMarkerIndex - 2, nextMarkerIndex).equals(Buffer.from('\r\n'))
      ? nextMarkerIndex - 2
      : nextMarkerIndex;

    parts.push(body.subarray(partStart, partEnd));
    searchFrom = nextMarkerIndex;
  }

  return parts;
}

function parseMultipartPart(part: Buffer): MultipartFile | null {
  const separator = Buffer.from('\r\n\r\n');
  const separatorIndex = part.indexOf(separator);

  if (separatorIndex === -1) {
    return null;
  }

  const rawHeaders = part.subarray(0, separatorIndex).toString('utf8');
  const body = part.subarray(separatorIndex + separator.length);
  const headers = parseHeaders(rawHeaders);
  const contentDisposition = headers['content-disposition'];

  if (!contentDisposition) {
    return null;
  }

  const fieldName = dispositionValue(contentDisposition, 'name');

  if (!fieldName) {
    return null;
  }

  return {
    fieldName,
    originalFilename: dispositionValue(contentDisposition, 'filename'),
    contentType: headers['content-type'] ?? 'application/octet-stream',
    buffer: body
  };
}

function parseHeaders(rawHeaders: string): MultipartHeaderMap {
  return rawHeaders.split('\r\n').reduce<MultipartHeaderMap>((headers, line) => {
    const separatorIndex = line.indexOf(':');

    if (separatorIndex === -1) {
      return headers;
    }

    headers[line.slice(0, separatorIndex).trim().toLowerCase()] = line
      .slice(separatorIndex + 1)
      .trim();

    return headers;
  }, {});
}

function dispositionValue(contentDisposition: string, key: string) {
  const match = new RegExp(`${key}="([^"]*)"`).exec(contentDisposition);
  return match?.[1] ?? null;
}
