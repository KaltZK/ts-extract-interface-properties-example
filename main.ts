import ts from "typescript";
import lodash from "lodash";

interface ScanResult {
    match: {
        node: ts.Node
        children: ts.Node[]
    }
    children: ScanResult[]
}

type NodeChecker = (node: ts.Node) => boolean

interface NodeScanner {
    node: NodeChecker
    children: NodeChecker[]
}

class NodeWalker {
    depth: number
    program: ts.Program
    scanners: NodeScanner[]
    constructor(program: ts.Program){
        this.depth = 0
        this.program = program
        this.scanners = []
    }

    start(name: string): ScanResult[] {
        this.depth = 0
        const sourceFile = this.program.getSourceFiles().filter(sf => sf.fileName === name)[0]
        this.program.emit(sourceFile);
        return this.walk(sourceFile)
    }

    private walk(node: ts.Node): ScanResult[] {
        console.log("  ".repeat(this.depth), ts.SyntaxKind[node.kind])
        this.depth++
        const children = node.getChildren()
        const childrenResult: ScanResult[][] = []
        for(const child of children){
            childrenResult.push(this.walk(child))
        }
        this.depth--
        const matchedChildren = this.scanners
            .map(s => s.node(node) && this.match(node, s.children))
            .filter(s => !!s)[0]
        // console.log(matchedChildren?.map(c => ts.SyntaxKind[c.kind]))
        if(matchedChildren){
            return [{
                match: {
                    node,
                    children: matchedChildren
                },
                children: lodash.flatten(childrenResult)
            }]
        } else {
            return lodash.flatten(childrenResult)
        }
    }

    private match(node: ts.Node, pattern: NodeChecker[]): ts.Node[] | null {
        let p=0, q=0
        const children = node.getChildren()
        const result = []
        while(p < pattern.length && q < children.length) {
            const checker = pattern[p]
            const child = children[q]
            if(checker(child)){
                p ++
                q ++
                result.push(child)
            } else {
                q ++
            }
        }
        if(p < pattern.length) return null;
        // console.log(
        //     ts.SyntaxKind[scanner.kind],
        //     scanner.children.map(s => ts.SyntaxKind[s]),
        //     children.map(c => c.kind).map(s => ts.SyntaxKind[s]),
        //     result.length, p)
        return result
    }

    addScanner(scanner: NodeScanner) {
        this.scanners.push(scanner)
    }

    ofKind(kind: keyof typeof ts.SyntaxKind): NodeChecker{
        return (n) => n.kind === ts.SyntaxKind[kind]
    }

}

function* _walkProperties(result: ScanResult, parent: string[]): Generator<string[]> {
    let path: string[]
    if(result.match.node.kind === ts.SyntaxKind.InterfaceDeclaration) {
        const [id] = result.match.children
        const name = id.getText()
        path = [...parent, name]
    } else if(result.match.node.kind === ts.SyntaxKind.TypeAliasDeclaration) {
        const [id, _content] = result.match.children
        const name = id.getText()
        path = [...parent, name]
    } else if (result.match.node.kind === ts.SyntaxKind.PropertySignature) {
        const [id, content] = result.match.children
        const name = id.getText()
        path = [...parent, name]
        if(content.kind === ts.SyntaxKind.StringKeyword){
            yield path
            return
        }
    }
    for(const child of result.children){
        yield* _walkProperties(child, path)
    }
}

function extractStringProperties(result: ScanResult): string[][] {
    return Array.from(_walkProperties(result, []))
}

async function main(){
    const program = ts.createProgram(["target.ts"], {})
    const walker = new NodeWalker(program)
    walker.addScanner({
        node: walker.ofKind("InterfaceDeclaration"),
        children: [walker.ofKind("Identifier")]
    })
    walker.addScanner({
        node: walker.ofKind("PropertySignature"),
        children: [
            walker.ofKind("Identifier"),
            walker.ofKind("StringKeyword")
        ]
    })
    walker.addScanner({
        node: walker.ofKind("PropertySignature"),
        children: [
            walker.ofKind("Identifier"),
            walker.ofKind("TypeLiteral")
        ]
    })
    walker.addScanner({
        node: walker.ofKind("TypeAliasDeclaration"),
        children: [
            walker.ofKind("Identifier"),
            walker.ofKind("TypeLiteral")
        ]
    })
    const result = walker.start("target.ts")
    for(const it of result){
        const properties = extractStringProperties(it)
        console.log(properties)
    }
}

main()
