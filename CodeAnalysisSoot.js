/**
 * This module is used to parse src code into USIM model. The construction is currently based on KDM. Further implementation can be made by using AST, which needs further investigation.
 *
 * This script relies on KDM and Java model
 *
 * The goal is the establish the control flow between the modules:
 * Identify the boundary (via KDM).
 * Identify the system components.
 * Establish the control flow between the components
 * Identify the stimuli.
 *      
 */

(function () {
	var fs = require('fs');
	var xml2js = require('xml2js');
	var parser = new xml2js.Parser();
	var jsonQuery = require('json-query');
	var jp = require('jsonpath');
	var uuidV1 = require('uuid/v1');
	var kdmModelUtils = require("./KDMModelUtils.js");
	var FileManagerUtils = require("../../utils/FileManagerUtils.js");

	function analyseCode(jsonString, outputDir) {
		
//		var androidAnalysisResults = FileManagerUtils.readJSONSync("H:\\ResearchSpace\\ResearchProjects\\UMLx\\facility-tools\\GATOR_Tool\\gator-3.5\\output\\android-analysis-output.json");

		var androidAnalysisResults = jsonString;
		
		var referencedClassUnits = androidAnalysisResults.classUnits;
		
		var dicClassUnits = {};
		var dicMethodUnits = {};
		var dicAttrUnits = {};
		var dicMethodClass = {};
//		var dicMethodParameters = {};
		var methodUnitsByName = {};
		var classUnits = [];
		
		for(var i in referencedClassUnits){
			var referencedClassUnit = referencedClassUnits[i];
			
			//process the name
			var packageName = referencedClassUnit.name.substring(0, referencedClassUnit.name.lastIndexOf('.'));
			var className = referencedClassUnit.name.substring(referencedClassUnit.name.lastIndexOf('.')+1, referencedClassUnit.name.length);
            var type = referencedClassUnit.type;

			var classUnit = {
					UUID: referencedClassUnit.UUID,
					name: className,
					type: type,
					packageName: packageName,
					isWithinBoundary: referencedClassUnit.isWithinBoundary,
					methodUnits: [],
					attrUnits: []
			};
			
			dicClassUnits[classUnit.UUID] = classUnit;
			classUnits.push(classUnit);
			
			for(var j in referencedClassUnit.methodUnits){
				
				var referencedMethodUnit = referencedClassUnit.methodUnits[j];
				
				var methodUnit = {
						UUID: referencedMethodUnit.UUID,
						signature:{
							name:referencedMethodUnit.name,
							parameterUnits: referencedMethodUnit.parameterTypes.map((parameterType)=>{return {type: parameterType}})
						},
				        publicity: referencedMethodUnit.publicity
				}
				
				classUnit.methodUnits.push(methodUnit);
				
				//need to adjust the method from Gator.
				
				dicMethodUnits[methodUnit.UUID] = methodUnit;
				
				methodUnitsByName[classUnit.name+":"+methodUnit.signature.name] = methodUnit;
				
				dicMethodClass[methodUnit.UUID] = referencedClassUnit.UUID;
				
				for(var k in methodUnit.parameterUnits){
					var parameterUnit = referencedMethodUnit.parameterUnits[k];
//					if(!dicMethodParameters[methodUnit.UUID]){
//						dicMethodParameters[methodUnit.UUID] = [];
//					}
//					dicMethodParameters[methodUnit.UUID].push(parameterUnit);
				}
			}
			
			for(var j in referencedClassUnit.attrUnits){
				var referencedAttrUnit = referencedClassUnit.attrUnits[j];
				var attrUnit = {
						name: referencedAttrUnit.name,
						type: referencedAttrUnit.type,
						UUID: referencedAttrUnit.UUID
				}
				dicAttrUnits[attrUnit.UUID] = attrUnit;
				classUnit.attrUnits.push(attrUnit);
			}
		}
		
		var dicCompositeSubclasses = {};
		var dicClassComposite = {};
		var referencedCompositeClassUnits = androidAnalysisResults.compositeClassUnits;
		var dicCompositeClassUnits = {};
		var compositeClassUnits = [];
		
		for(var i in referencedCompositeClassUnits){
			var referencedCompositeClassUnit = referencedCompositeClassUnits[i];
			
			//process the name
			var packageName = referencedCompositeClassUnit.name.substring(0, referencedCompositeClassUnit.name.lastIndexOf('.'));
			var className = referencedCompositeClassUnit.name.substring(referencedCompositeClassUnit.name.lastIndexOf('.')+1, referencedCompositeClassUnit.name.length);
			
			var compositeClassUnit = {
					name: className,
					packageName : packageName,
					UUID : referencedCompositeClassUnit.UUID,
					classUnits : []
			}
			
			
			for(var j in referencedCompositeClassUnit.classUnits){
				var subClassUnit = referencedCompositeClassUnit.classUnits[j];

				compositeClassUnit.classUnits.push(subClassUnit);
				if(!dicCompositeSubclasses[compositeClassUnit.UUID]){
					dicCompositeSubclasses[compositeClassUnit.UUID] = [];
				}
				dicCompositeSubclasses[compositeClassUnit.UUID].push(subClassUnit);
				dicClassComposite[subClassUnit] = compositeClassUnit.UUID;
				dicCompositeClassUnits[compositeClassUnit.UUID] = compositeClassUnit;
			}
			
			compositeClassUnits.push(compositeClassUnit);
		}
		
		var debug = require("../../utils/DebuggerOutput.js");

//		console.log(classUnits.length);
//                for(var i in classUnits){
//                    debug.appendFile2("classes", "packageName: "+classUnits[i].packageName+" className: "+classUnits[i].name+"\n", outputDir);
//                }
//
//        console.log(compositeClassUnits.length);
//        for(var i in compositeClassUnits){
//            debug.appendFile2("composite-classes", compositeClassUnits[i].name+"\n", outputDir);
//        }
//        process.exit();

		var result = {
			dicClassUnits: dicClassUnits,
			dicCompositeClassUnits: dicCompositeClassUnits,
			dicClassComposite: dicClassComposite,
			dicMethodUnits: dicMethodUnits,
			dicMethodClass: dicMethodClass,
			callGraph: convertCallDependencyGraph(androidAnalysisResults, dicClassUnits, dicClassComposite, dicCompositeClassUnits, dicMethodUnits, dicAttrUnits),
			accessGraph: convertAccessDependencyGraph(androidAnalysisResults, dicClassUnits, dicClassComposite, dicCompositeClassUnits, dicMethodUnits, dicAttrUnits),
			extendsGraph: convertExtensionDependencyGraph(androidAnalysisResults, dicClassUnits, dicClassComposite, dicCompositeClassUnits, dicMethodUnits, dicAttrUnits),
			compositionGraph: convertCompositionDependencyGraph(androidAnalysisResults, dicClassUnits, dicClassComposite, dicCompositeClassUnits, dicMethodUnits, dicAttrUnits),
			typeDependencyGraph: convertTypeDependencyGraph(androidAnalysisResults, dicClassUnits, dicClassComposite, dicCompositeClassUnits, methodUnitsByName, dicMethodUnits, dicAttrUnits),
			referencedClassUnits: classUnits,
			referencedCompositeClassUnits: compositeClassUnits,
			dicCompositeSubclasses: dicCompositeSubclasses,
//			dicMethodParameters: dicMethodParameters,
			cfg: androidAnalysisResults.cfg
		};

//		debug.writeJson2("converted-android-analysis-results-dic-method-units", dicMethodUnits, outputDir);
//	    debug.writeJson2("converted-android-analysis-results-dic-class-units", dicClassUnits, outputDir);
//		debug.writeJson2("converted-android-analysis-results-call-graph", result.callGraph, outputDir);
//	    debug.writeJson2("converted-android-analysis-results-access-graph", result.accessGraph, outputDir);
//		debug.writeJson2("converted-android-analysis-results-extension-graph", result.extendsGraph, outputDir);
//		debug.writeJson2("converted-android-analysis-results-composition-graph", result.compositionGraph, outputDir);
//		debug.writeJson2("converted-android-analysis-results-type-dependency-graph", result.typeDependencyGraph, outputDir);
//
		return result;
	}
	
	
	function convertAccessDependencyGraph(androidAnalysisResults, dicClassUnits, dicClassComposite, dicCompositeClassUnits, dicMethodUnits){
		//construct access graph
		var accessGraph = {
			nodes: [],
			edges: [],
			nodesComposite: [],
			edgesComposite: []
		}

        var accessGraphJSON = androidAnalysisResults.accessGraph;
        if(typeof accessGraphJSON !== 'object'){
          accessGraphJSON = FileManagerUtils.readJSONSync(androidAnalysisResults.accessGraph);
        }
		
		for(var i in accessGraphJSON.edges){
			var edge = accessGraphJSON.edges[i];
			
			var accessMethodUnit = dicMethodUnits[edge.start.methodUnit];
			var accessClassUnit = dicClassUnits[edge.start.classUnit];
			var accessCompositeClassUnit = dicCompositeClassUnits[dicClassComposite[edge.start.classUnit]];
			
			if(!accessMethodUnit || ! accessClassUnit){
				continue;
			}
			
			var accessNode = {
					name: accessClassUnit.name+":"+accessMethodUnit.signature.name,
					component:accessClassUnit,
					UUID: accessMethodUnit.UUID,
					methodName: accessMethodUnit.signature.name
			}
			
			accessGraph.nodes.push(accessNode);
			
			var accessCompositeNode = {
					name: accessCompositeClassUnit.name+":"+accessMethodUnit.signature.name,
					component:accessCompositeClassUnit,
					UUID: accessMethodUnit.UUID,
					methodName: accessMethodUnit.signature.name
			}
			accessGraph.nodesComposite.push(accessCompositeNode);
			
			var accessedAttrUnit = edge.end.attrUnit;
			var accessedClassUnit = dicClassUnits[edge.end.classUnit];
			var accessedCompositeClassUnit = dicCompositeClassUnits[dicClassComposite[edge.end.classUnit]];
			
			if(!accessedAttrUnit || !accessedClassUnit || !accessedCompositeClassUnit){
				continue;
			}
			
			var accessedNode = {
					name: accessedClassUnit.name+":"+accessedAttrUnit.name,
					component:accessedClassUnit,
					UUID: accessedAttrUnit.UUID,
					attrName: accessedAttrUnit.name,
					attrType: accessedAttrUnit.type
			}
			
			accessGraph.nodes.push(accessedNode);
			
			var accessedCompositeNode = {
					name: accessedCompositeClassUnit.name+":"+accessedAttrUnit.name,
					component:accessedCompositeClassUnit,
					UUID: accessedAttrUnit.UUID,
					attrName: accessedAttrUnit.name,
					attrType: accessedAttrUnit.type
			}
			
			accessGraph.nodesComposite.push(accessedCompositeNode);
			
			accessGraph.edges.push({start:accessNode, end:accessedNode});
			accessGraph.edgesComposite.push({start:accessCompositeNode, end:accessedCompositeNode});
			
		}
		
		return accessGraph;
	}
	
	function convertCallDependencyGraph(androidAnalysisResults, dicClassUnits, dicClassComposite, dicCompositeClassUnits, dicMethodUnits){
		var callGraph = {
				nodes: [],
				edges: [],
				nodesComposite: [],
				edgesComposite: []
			}

           var callGraphJSON = androidAnalysisResults.callGraph;
           if(typeof callGraphJSON !== 'object'){
			callGraphJSON = FileManagerUtils.readJSONSync(androidAnalysisResults.callGraph);
			}
			
			for(var i in callGraphJSON.edges){
				var edge = callGraphJSON.edges[i];
				var callMethodUnit = dicMethodUnits[edge.start.methodUnit];
				var callClassUnit = dicClassUnits[edge.start.classUnit];
				var callCompositeClassUnit = dicCompositeClassUnits[dicClassComposite[edge.start.classUnit]];
				
				if(!callMethodUnit || !callClassUnit || !callCompositeClassUnit){
					continue;
				}
				
				var callNode = {
						name: callClassUnit.name+":"+callMethodUnit.signature.name,
						component:callClassUnit,
						UUID: callMethodUnit.UUID,
						methodName: callMethodUnit.signature.name
				}
				
				callGraph.nodes.push(callNode);
				
				var callCompositeNode = {
						name: callCompositeClassUnit.name+":"+callMethodUnit.signature.name,
						component:callCompositeClassUnit,
						UUID: callMethodUnit.UUID,
						methodName: callMethodUnit.signature.name
				}
				callGraph.nodesComposite.push(callNode);
				
				var calleeMethodUnit = dicMethodUnits[edge.end.methodUnit];
				var calleeClassUnit = dicClassUnits[edge.end.classUnit];
				var calleeCompositeClassUnit = dicCompositeClassUnits[dicClassComposite[edge.end.classUnit]];
				var calleeNode = {
						name: calleeClassUnit.name+":"+calleeMethodUnit.signature.name,
						component:calleeClassUnit,
						UUID: calleeMethodUnit.UUID,
						methodName: calleeMethodUnit.signature.name
				}
				
				callGraph.nodes.push(calleeNode);
				
				var calleeCompositeNode = {
						name: calleeCompositeClassUnit.name+":"+calleeMethodUnit.signature.name,
						component:calleeCompositeClassUnit,
						UUID: calleeMethodUnit.UUID,
						methodName: calleeMethodUnit.signature.name
				}
				
				callGraph.nodesComposite.push(calleeNode);
				
				callGraph.edges.push({start:callNode, end:calleeNode});
				callGraph.edgesComposite.push({start:callCompositeNode, end:calleeCompositeNode});
			}
		
		
		return callGraph;
	}
	
	function convertCompositionDependencyGraph(androidAnalysisResults, dicClassUnits, dicClassComposite, dicCompositeClassUnits, dicMethodUnits, dicAttrUnits){
		//construct access graph
		var compositionGraph = {
			nodes: [],
			edges: [],
			nodesComposite: [],
			edgesComposite: []
		};
		
		var nodesAttrByID = {};
		var edgesAttrByID = {};
		
		var nodesAttrCompositeByID = {};
		var edgesAttrCompositeByID = {};
		
		//right now I'm directly using the type dependency graph. Need to make an individual graph.
        var compositionGraphJSON = androidAnalysisResults.compositionGraph;
        if(compositionGraphJSON && typeof compositionGraphJSON !== 'object'){
        compositionGraphJSON = FileManagerUtils.readJSONSync(androidAnalysisResults.compositionGraph);
        }

//        //for legacy data structure
//        if(!compositionGraphJSON && androidAnalysis.typeDependencyGraph){
//            compositionGraphJSON = {
//                nodes: []
//            }
//            for(var i in androidAnalysis.typeDependencyGraph.nodes){
//                compositionGraphJSON.nodes.push({
//                androidAnalysis.typeDependencyGraph.nodes[i]
//                }
//                )
//                }
//            }
//        }

		for(var i in compositionGraphJSON.nodes){
			
			var node = compositionGraphJSON.nodes[i];
			var dependencies = node.dependencies;
			var targetClassUnit = dicClassUnits[node.uuid];
			if(!targetClassUnit){
				continue;
			}
			
			var targetCompositeClassUnit = dicCompositeClassUnits[dicClassComposite[targetClassUnit.UUID]];
			for(var j in dependencies){
				var dependency = dependencies[j];
				var classUnit = dicClassUnits[dependency["uuid"]];
				var compositeClassUnit = dicCompositeClassUnits[dicClassComposite[classUnit.UUID]];
				
				var attrDependencies = dependency.attrDependencies;
				
		for(var k in attrDependencies){
			var attrDependency = attrDependencies[k];
			
			var attrUnit = dicAttrUnits[attrDependency["attributeUuid"]];
			
			if(attrUnit){
			var startNode = nodesAttrByID[attrUnit.UUID];
			if(!startNode){
				startNode = {
					name: attrUnit.name +":attrDependency",
					UUID: attrUnit.UUID,
					attr: attrUnit,
					component: classUnit,
				}
				nodesAttrByID[startNode.UUID] = startNode;
			}
			

			var endNode = nodesAttrByID[targetClassUnit.UUID];
			if(!endNode){
			endNode = {
					name: targetClassUnit.name,
					component: targetClassUnit,
					UUID: targetClassUnit.UUID
			}
			nodesAttrByID[endNode.UUID] = endNode;
			}

			compositionGraph.edges.push({start: startNode, end: endNode});
			
			var startNodeComposite = nodesAttrCompositeByID[attrUnit.UUID];
			if(!startNodeComposite){
				startNodeComposite = {
					name: attrUnit.name +":attrDependency",
					UUID: attrUnit.UUID,
					attr: attrUnit,
					component: compositeClassUnit
				}
				nodesAttrCompositeByID[startNodeComposite.UUID] = startNodeComposite;
			}
			
			var endNodeComposite = nodesAttrCompositeByID[targetCompositeClassUnit.UUID];
			if(!endNodeComposite){
				endNodeComposite = {
					name: targetCompositeClassUnit.UUID,
					UUID: targetCompositeClassUnit.name,
					component: targetCompositeClassUnit
				}
				nodesAttrCompositeByID[targetCompositeClassUnit.UUID] = endNodeComposite;
			}
			
			compositionGraph.edgesComposite.push({start: startNodeComposite, end: endNodeComposite});
			}
		}
			}
		}
		
		return compositionGraph;
	}
	
	function convertExtensionDependencyGraph(androidAnalysisResults, dicClassUnits, dicClassComposite, dicCompositeClassUnits, dicMethodUnits){
		//construct extension graph
		var extensionGraph = {
			nodes: [],
			edges: [],
			nodesComposite: [],
			edgesComposite: []
		};
		
		var dicNodes = {};
		var dicNodesComposite = {};
		var dicEdges = {};
		var dicEdgesComposite = {};

        var extendsGraphJSON = androidAnalysisResults.extendsGraph;
        if(typeof extendsGraphJSON !== 'object'){
		extendsGraphJSON = FileManagerUtils.readJSONSync(androidAnalysisResults.extendsGraph);
		}
		
		for(var i in extendsGraphJSON){
			var edge = extendsGraphJSON[i];
			var fromClass = dicClassUnits[edge.from.uuid];
			var toClass = dicClassUnits[edge.to.uuid];
			
			if(!fromClass || !toClass){
				continue;
			}
			
			var fromNode = {
					name: fromClass.name,
					UUID: fromClass.UUID,
					component: fromClass
			}
			
			var toNode = {
					name: toClass.name,
					UUID: toClass.UUID,
					component: toClass
			}
			
			
			if(!dicNodes[fromNode.UUID]){
				extensionGraph.nodes.push(fromNode);
				dicNodes[fromNode.UUID] = 1;
			}
			
			if(!dicNodes[toNode.UUID]){
				extensionGraph.nodes.push(toNode);
				dicNodes[toNode.UUID] = 1;
			}
			

			if(!dicEdges[fromNode.UUID+"->"+toNode.UUID]){
			extensionGraph.edges.push({start: fromNode, end: toNode});
			dicEdges[fromNode.UUID+"->"+toNode.UUID] = 1;
			}
			
			
			var fromCompositeClassUnit = dicCompositeClassUnits[dicClassComposite[fromNode.UUID]];
			var toCompositeClassUnit = dicCompositeClassUnits[dicClassComposite[toNode.UUID]];
			
			var fromNodeComposite = {
					name: fromCompositeClassUnit.name,
					UUID: fromCompositeClassUnit.UUID,
					component: fromCompositeClassUnit
			}
			
			var toNodeComposite = {
					name: toCompositeClassUnit.name,
					UUID: toCompositeClassUnit.UUID,
					component: toCompositeClassUnit
			}
			
			if(!dicNodes[fromNodeComposite.UUID]){
				extensionGraph.nodesComposite.push(fromNodeComposite);
				dicNodesComposite[fromNodeComposite.UUID] = 1;
			}
			
			if(!dicNodes[toNodeComposite.UUID]){
				extensionGraph.nodesComposite.push(toNodeComposite);
				dicNodesComposite[toNodeComposite.UUID] = 1;
			}
			
			
			if(!dicEdgesComposite[fromNode.UUID+"->"+toNode.UUID]){
//				compositionGraph.edgesComposite.push({start: fromNodeComposite, end: toNodeComposite});
				extensionGraph.edgesComposite.push({start: fromNodeComposite, end: toNodeComposite});
				}
		}
		
		return extensionGraph;
	}
	
	function convertTypeDependencyGraph(androidAnalysisResults, dicClassUnits, dicClassComposite, dicCompositeClassUnits, methodUnitsByName, dicMethodUnits, dicAttrUnits){
		//construct access graph
		var typeDependencyGraph = {
			nodesLocal: [],
			edgesLocal: [],
			nodesParam: [],
			edgesParam: [],
			nodesReturn: [],
			edgesReturn: [],
			nodesLocalComposite: [],
			edgesLocalComposite: [],
			nodesParamComposite: [],
			edgesParamComposite: [],
			nodesReturnComposite: [],
			edgesReturnComposite: []
		};
		
		var nodesLocalByID = {};
		var edgesLocalByID = {};
		
		var nodesParamByID = {};
		var edgesParamByID  = {};
		
		var nodeReturnByID = {};
		var edgesReturnByID = {};
		
		var nodesLocalCompositeByID = {};
		var edgesLocalCompositeByID = {};
		
		var nodesParamCompositeByID = {};
		var edgesParamCompositeByID = {};

		var nodesReturnCompositeByID = {};
		var edgesReturnCompositeByID = {};

        var typeDependencyGraphJSON = androidAnalysisResults.typeDependencyGraph;
        if(typeof typeDependencyGraphJSON !== 'object'){
		typeDependencyGraphJSON = FileManagerUtils.readJSONSync(androidAnalysisResults.typeDependencyGraph);
		}
	
		for(var i in typeDependencyGraphJSON.nodes){
			var node = typeDependencyGraphJSON.nodes[i];
			var dependencies = node.dependencies;
			var targetClassUnit = dicClassUnits[node.uuid];
			if(!targetClassUnit){
				continue;
			}
			
			var targetCompositeClassUnit = dicCompositeClassUnits[dicClassComposite[targetClassUnit.UUID]];
			for(var j in dependencies){
				var dependency = dependencies[j];
				var classUnit = dicClassUnits[dependency["uuid"]];
				var compositeClassUnit = dicCompositeClassUnits[dicClassComposite[classUnit.UUID]];
				
				var returnDependencies = dependency.returnDependencies;
				for(var k in returnDependencies){
					var returnDependency = returnDependencies[k];
					var methodUnit = dicMethodUnits[returnDependency["methodUuid"]];
					
					if(methodUnit){
					var startNode = nodeReturnByID[methodUnit.UUID];
					if(!startNode){
						startNode = {
							name: methodUnit.signature.name +":returnDependency",
							UUID: methodUnit.UUID,
							method:methodUnit,
							component: classUnit
						}
						nodeReturnByID[startNode.UUID] = startNode;
					}
				
					
					var endNode = nodeReturnByID[targetClassUnit.UUID];
					if(!endNode){
					endNode = {
							name: targetClassUnit.name,
							component: targetClassUnit,
							UUID: targetClassUnit.UUID
					}
					nodeReturnByID[endNode.UUID] = endNode;
					}

					typeDependencyGraph.edgesReturn.push({start: startNode, end: endNode});
					
					var startNodeComposite = nodesReturnCompositeByID[methodUnit.UUID];
					if(!startNodeComposite){
						startNodeComposite = {
							name: methodUnit.signature.name +":returnDependency",
							UUID: methodUnit.UUID,
							method:methodUnit,
							component: compositeClassUnit
						}
						nodesReturnCompositeByID[startNodeComposite.UUID] = startNodeComposite;
					}
					
					var endNodeComposite = nodesReturnCompositeByID[targetCompositeClassUnit.UUID];
					if(!endNodeComposite){
						endNodeComposite = {
							name: targetCompositeClassUnit.UUID,
							UUID: targetCompositeClassUnit.name,
							component: targetCompositeClassUnit
						}
						nodesReturnCompositeByID[endNodeComposite.UUID] = endNodeComposite;
					}
					
					typeDependencyGraph.edgesReturnComposite.push({start: startNodeComposite, end: endNodeComposite});
					
					}
				}
				
				var paramDependencies = dependency.paramDependencies;
				
				for(var k in paramDependencies){
					var paramDependency = paramDependencies[k];
					var methodUnit = dicMethodUnits[paramDependency["methodUuid"]];
					
					if(methodUnit){
					var startNode = nodesParamByID[methodUnit.UUID];
					if(!startNode){
						startNode = {
							name: methodUnit.signature.name +":paramDependency",
							UUID: methodUnit.UUID,
							method:methodUnit,
							component: classUnit
						}
						nodesParamByID[startNode.UUID] = startNode;
					}
					
					var endNode = nodesParamByID[targetClassUnit.UUID];
					if(!endNode){
					endNode = {
							name: targetClassUnit.name,
							component: targetClassUnit,
							UUID: targetClassUnit.UUID
					}
					nodesParamByID[endNode.UUID] = endNode;
					}
					
					typeDependencyGraph.edgesParam.push({start: startNode, end: endNode});
					
					
					var startNodeComposite = nodesParamCompositeByID[methodUnit.UUID];
					if(!startNodeComposite){
						startNodeComposite = {
							name: methodUnit.signature.name +":paramDependency",
							UUID: methodUnit.UUID,
							method:methodUnit,
							component: compositeClassUnit
						}
						nodesParamCompositeByID[startNodeComposite.UUID] = startNodeComposite;
					}
					
					var endNodeComposite = nodesParamCompositeByID[targetCompositeClassUnit.UUID];
					if(!endNodeComposite){
						endNodeComposite = {
							name: targetCompositeClassUnit.UUID,
							UUID: targetCompositeClassUnit.name,
							component: targetCompositeClassUnit
						}
						nodesParamCompositeByID[endNodeComposite.UUID] = endNodeComposite;
					}
					
					typeDependencyGraph.edgesParamComposite.push({start: startNodeComposite, end: endNodeComposite});
					
					}
				}
				
				var localDependencies = dependency.localDependencies;
				
				for(var k in localDependencies){
					var localDependency = localDependencies[k];
					var methodUnit = dicMethodUnits[paramDependency["methodUuid"]];
					
					if(methodUnit){
					var startNode = nodesLocalByID[methodUnit.UUID];
					if(!startNode){
						startNode = {
							name: methodUnit.signature.name +":localDependency",
							UUID: methodUnit.UUID,
							method:methodUnit,
							component: classUnit
						}
						nodesLocalByID[startNode.UUID] = startNode;
					}
					
						
					
					var endNode = nodesLocalByID[targetClassUnit.UUID];
					if(!endNode){
					endNode = {
							name: targetClassUnit.name,
							component: targetClassUnit,
							UUID: targetClassUnit.UUID
					}
					nodesLocalByID[endNode.UUID] = endNode;
					}
					

					typeDependencyGraph.edgesLocal.push({start: startNode, end: endNode});
					
					var startNodeComposite = nodesLocalCompositeByID[methodUnit.UUID];
					if(!startNodeComposite){
						startNodeComposite = {
							name: methodUnit.signature.name +":localDependency",
							UUID: methodUnit.UUID,
							method:methodUnit,
							component: compositeClassUnit
						}
						nodesLocalCompositeByID[startNodeComposite.UUID] = startNodeComposite;
					}
					
					var endNodeComposite = nodesLocalCompositeByID[targetCompositeClassUnit.UUID];
					if(!endNodeComposite){
						endNodeComposite = {
							name: targetCompositeClassUnit.name,
							UUID: targetCompositeClassUnit.UUID,
							component: targetClassUnit
						}
						nodesLocalCompositeByID[endNodeComposite.UUID] = endNodeComposite;
					}
					
					typeDependencyGraph.edgesLocalComposite.push({start: startNodeComposite, end: endNodeComposite});
					
					}
				}
				
			}
			
		}
		
		return typeDependencyGraph;
	}

	module.exports = {
		analyseCode: analyseCode
	}
}());