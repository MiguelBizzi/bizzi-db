// usage: swift make-alias.swift <dest> <target> <icon.png>
import AppKit

let args = CommandLine.arguments
guard args.count == 4 else {
    FileHandle.standardError.write(Data("usage: make-alias <dest> <target> <icon.png>\n".utf8))
    exit(2)
}
let dest = URL(fileURLWithPath: args[1])
let target = URL(fileURLWithPath: args[2])
guard let icon = NSImage(contentsOfFile: args[3]) else {
    FileHandle.standardError.write(Data("cannot read icon \(args[3])\n".utf8))
    exit(1)
}
let bookmark = try target.bookmarkData(options: .suitableForBookmarkFile, includingResourceValuesForKeys: nil, relativeTo: nil)
try URL.writeBookmarkData(bookmark, to: dest)
guard NSWorkspace.shared.setIcon(icon, forFile: dest.path, options: []) else {
    FileHandle.standardError.write(Data("setIcon failed\n".utf8))
    exit(1)
}
