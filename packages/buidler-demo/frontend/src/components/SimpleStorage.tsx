import { ethers } from 'ethers';
import { Box, Button, DataTable, Grid, Heading } from 'grommet';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { CurrentAddressContext, ProviderContext, SignerContext, SimpleStorageContext } from './../buidler/BuidlerContext';
import { Buckets, PrivateKey, } from "@textile/hub";
import { hashSync } from 'bcryptjs'


interface Props { }

interface Document {
    name: string,
    url?: string,
    hash?: string
}


export const SimpleStorage: React.FC<Props> = () => {
    const SimpleStorage = useContext(SimpleStorageContext)
    const [provider] = useContext(ProviderContext)
    const [currentAddress] = useContext(CurrentAddressContext)
    const [signer] = useContext(SignerContext)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [documents, setDocuments] = useState<Document[]>([]);
    const [secret, setSecret] = useState("SomeRandomSecret");

    useEffect(() => {
        const doAsync = async () => {
            console.log("Check sim", SimpleStorage)
            if (SimpleStorage.instance) {
                try {
                    const listBytes = await SimpleStorage.instance.getDocumentList()
                    const list = listBytes.map(id => ethers.utils.parseBytes32String(id))
                    setDocuments(list.map(name => ({ name })))
                    SimpleStorage.instance.on("Document", (res) => {
                        const newName = ethers.utils.parseBytes32String(res)
                        const exist = list.indexOf(newName) === -1
                        if (exist)
                            setDocuments(old => [...old, { name: newName }])
                    })
                } catch (error) {
                }
            }
        };
        doAsync();
        // eslint-disable-next-line
    }, [SimpleStorage.instance])

    const getBuckets = async (): Promise<[Buckets, string]> => {
        if (!SimpleStorage.instance) {
            throw Error("Need contract instance to know hich bucket to get.")
        }
        // TODO Create identiyy from web3modal
        const identity = await generatePrivateKey()
        const buckets = await Buckets.withKeyInfo({ key: "biepyo75p2zaavunhyj7ndeydkq" }) // TODO Set unsecure key user key from Hub
        await buckets.getToken(identity)
        const bucketResult = await buckets.getOrCreate(SimpleStorage.instance.address)
        if (!bucketResult.root) {
            throw Error("Failed to open Bucket.")
        }
        if (!bucketResult.root.key) {
            throw Error("Failed to open Bucket root key.")
        }

        return [buckets, bucketResult.root.key]
    }

    const uploadDocument = async (fileName: string, data: string): Promise<string> => {
        if (provider && signer && SimpleStorage.instance) {
            const [buckets, key] = await getBuckets()
            const pathResult = await buckets.pushPath(key, fileName, data)
            console.log("pathResult<", pathResult)

            const display = (num?: number) => {
                console.log('Progress:', num)
            }
            const read = (value: any) => {
                console.log(value)
            }
            const tryget = await buckets.pullPath(key, pathResult.path.path, { progress: display })
            console.log("tryget", tryget)
            read(tryget.next())
            return pathResult.path.path
        } else {
            throw Error("Could not upload document.")
        }
    }

    const getDocument = async (name: string) => {
        if (SimpleStorage.instance) {
            const document = await SimpleStorage.instance.getDocument(ethers.utils.formatBytes32String(name))
            //Textile stuff
            const [buckets, key] = await getBuckets()
            const display = (num?: number) => {
                console.log('Progress:', num)
            }
            console.log("document.docURI", document.docURI.split("/").pop())
            const res = await buckets.pullPath(key, document.docURI, { progress: display })
            console.log("res", await res.next())

            setDocuments(old => {
                return old.map(x => {
                    if (x.name === name) {
                        return {
                            name,
                            url: document.docURI,
                            hash: document.docHash
                        }
                    }
                    return x
                })
            })
        }
    }

    const saveDocument = async (file: { name: string, type: string, data: string }) => {
        if (SimpleStorage.instance) {
            const nameBytes32 = ethers.utils.formatBytes32String(file.name.substr(0, 31))
            const url = await uploadDocument(file.name, file.data)
            // const url = "https://somestorage.com"
            const hashOfDocument = ethers.utils.sha256(ethers.utils.toUtf8Bytes(file.data))
            /* const tx =  */await SimpleStorage.instance.setDocument(nameBytes32, url, hashOfDocument)
        }
    }

    const handleFile = (event: any) => {
        console.log("Handle File")
        event.preventDefault();
        const reader = new FileReader();
        if (fileInputRef.current?.files) {
            console.log("Running")
            const file = fileInputRef.current.files[0]
            reader.onload = (e) => {
                console.log("Onload ", e.target)
                if (e.target) {
                    if (typeof e.target.result === "string") {
                        saveDocument({
                            name: file.name,
                            type: file.type,
                            data: e.target.result
                        })
                    }
                };
            }
            reader.readAsDataURL(file)
        }
    }

    const generatePrivateKey = async (): Promise<PrivateKey> => {
        if (!signer) {
            throw Error("Signer not defined. Cant generate private key for Textile.")
        }

        // avoid sending the raw secret by hashing it first
        const _secret = hashSync(secret, 10)
        const message = generateMessageForEntropy(currentAddress, 'symfoni-demo', _secret)
        const signedText = await signer.signMessage(message);
        const hash = ethers.utils.keccak256(signedText);
        if (hash === null) {
            throw new Error('No account is provided. Please provide an account to this application.');
        }
        // The following line converts the hash in hex to an array of 32 integers.
        // @ts-ignore
        const array = hash
            // @ts-ignore
            .replace('0x', '')
            // @ts-ignore
            .match(/.{2}/g)
            .map((hexNoPrefix) => ethers.BigNumber.from('0x' + hexNoPrefix).toNumber())

        if (array.length !== 32) {
            throw new Error('Hash of signature is not the correct size! Something went wrong!');
        }
        const identity = PrivateKey.fromRawEd25519Seed(Uint8Array.from(array))
        console.log(identity.toString())

        // Your app can now use this identity for generating a user Mailbox, Threads, Buckets, etc
        return identity
    }

    const generateMessageForEntropy = (ethereum_address: string, application_name: string, secret: string): string => {
        return (
            '******************************************************************************** \n' +
            'READ THIS MESSAGE CAREFULLY. \n' +
            'DO NOT SHARE THIS SIGNED MESSAGE WITH ANYONE OR THEY WILL HAVE READ AND WRITE \n' +
            'ACCESS TO THIS APPLICATION. \n' +
            'DO NOT SIGN THIS MESSAGE IF THE FOLLOWING IS NOT TRUE OR YOU DO NOT CONSENT \n' +
            'TO THE CURRENT APPLICATION HAVING ACCESS TO THE FOLLOWING APPLICATION. \n' +
            '******************************************************************************** \n' +
            'The Ethereum address used by this application is: \n' +
            '\n' +
            ethereum_address +
            '\n' +
            '\n' +
            '\n' +
            'By signing this message, you authorize the current application to use the \n' +
            'following app associated with the above address: \n' +
            '\n' +
            application_name +
            '\n' +
            '\n' +
            '\n' +
            'The hash of your non-recoverable, private, non-persisted password or secret \n' +
            'phrase is: \n' +
            '\n' +
            secret +
            '\n' +
            '\n' +
            '\n' +
            '******************************************************************************** \n' +
            'ONLY SIGN THIS MESSAGE IF YOU CONSENT TO THE CURRENT PAGE ACCESSING THE KEYS \n' +
            'ASSOCIATED WITH THE ABOVE ADDRESS AND APPLICATION. \n' +
            'AGAIN, DO NOT SHARE THIS SIGNED MESSAGE WITH ANYONE OR THEY WILL HAVE READ AND \n' +
            'WRITE ACCESS TO THIS APPLICATION. \n' +
            '******************************************************************************** \n'
        );
    }
    return (
        <Box gap="large">
            <Heading level="2">Simple storage</Heading>

            <form onSubmit={handleFile}>
                <Box elevation="small" pad="small" >
                    <Heading level="3">Set document</Heading>
                    <Grid gap="medium" columns={["small", "small"]} align="center">
                        <input type="file" ref={fileInputRef} />
                        <Button type="submit" label="Upload file"></Button>
                    </Grid>
                </Box>
            </form>


            <Box elevation="small" pad="small" >
                <Heading level="3">List document</Heading>
                <Grid gap="medium" align="center">
                    <DataTable
                        data={documents}
                        onClickRow={(e) => getDocument(e.datum.name)}
                        cellPadding={50}
                        cellSpacing="509"
                        columns={[
                            {
                                property: "name",
                                header: "Name",
                                render: (data) => data.name.substr(0, 31),
                            },
                            {
                                property: "hash",
                                header: "Hash",
                                render: ({ hash }) => (
                                    hash ?
                                        hash.substr(0, 15)
                                        : "Click to update"

                                )
                            },
                            {
                                property: "URL",
                                header: "Url",
                                render: ({ url }) => (
                                    url ? url : ""
                                )
                            }
                        ]}
                    ></DataTable>
                </Grid>
            </Box>


        </Box>
    )
}

